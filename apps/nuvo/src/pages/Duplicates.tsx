import { formatBytes, type CloudAsset } from "@nuvo/shared";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../components/icons";
import { Button, Empty, Spinner } from "../components/ui";
import { groupSimilar } from "../lib/dedup";
import { useDeleteAssets, useLibraryAssets, useMe, useSpace } from "../lib/queries";

/** 남길 사진: 해상도가 가장 높은 것, 같으면 용량이 큰 것 (카톡 압축본보다 원본) */
const score = (a: CloudAsset) => (a.width ?? 0) * (a.height ?? 0) * 1e3 + a.size / 1e6;

export function DuplicatesPage() {
  const { id: spaceId } = useParams();
  const me = useMe();
  const space = useSpace(spaceId);
  const libraryId = spaceId ? space.data?.library.id : me.data?.personal?.id;
  const assets = useLibraryAssets(libraryId);
  const del = useDeleteAssets();
  const [done, setDone] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () =>
      groupSimilar(assets.assets, (a) => a.dhash)
        .map((g) => [...g].sort((a, b) => score(b) - score(a)))
        .filter((g) => !done.has(g[0]!.id)),
    [assets.assets, done],
  );
  const extra = groups.reduce((n, g) => n + g.length - 1, 0);
  const back = spaceId ? `/spaces/${spaceId}` : "/library";

  const clean = (gs: CloudAsset[][]) => {
    const ids = gs.flatMap((g) => g.slice(1).map((a) => a.id));
    if (!ids.length || !confirm(`비슷한 사진 ${ids.length}장을 지우고, 그룹마다 가장 선명한 1장만 남길까요?`)) return;
    del.mutate(ids, { onSuccess: () => setDone((d) => new Set([...d, ...gs.map((g) => g[0]!.id)])) });
  };

  return (
    <div className="mx-auto max-w-4xl pt-8">
      <Link to={back} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <Icon name="left" size={16} /> 돌아가기
      </Link>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">중복 정리</h1>
          <p className="mt-1 text-sm text-faint">
            크기만 다르거나 다시 압축된 사진(카톡으로 주고받은 사진 등)을 찾아요.
          </p>
        </div>
        {groups.length > 0 && (
          <Button variant="primary" className="ml-auto" onClick={() => clean(groups)} disabled={del.isPending}>
            모두 정리 ({extra}장)
          </Button>
        )}
      </div>

      {!assets.complete ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : groups.length === 0 ? (
        <Empty icon="check" title="중복된 사진이 없어요">깔끔하게 정리되어 있어요.</Empty>
      ) : (
        <ul className="mt-8 flex flex-col gap-6">
          {groups.map((g) => (
            <li key={g[0]!.id} className="rounded-2xl border border-line p-4" data-testid="dup-group">
              <div className="flex gap-3 overflow-x-auto">
                {g.map((a, i) => (
                  <figure key={a.id} className="w-36 shrink-0">
                    <div className={`relative aspect-square overflow-hidden rounded-xl ${i === 0 ? "ring-2 ring-accent" : "opacity-70"}`}>
                      <img src={a.urls.thumb} alt="" className="size-full object-cover" loading="lazy" />
                      {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-ink">남길 사진</span>}
                    </div>
                    <figcaption className="mt-1.5 text-[11px] leading-snug text-faint">
                      {a.width}×{a.height} · {formatBytes(a.size)}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => clean([g])} disabled={del.isPending}>
                  {g.length - 1}장 정리
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
