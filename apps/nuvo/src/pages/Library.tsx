import { formatBytes } from "@nuvo/shared";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AddFolderButton, LocalFolderChips } from "../components/LocalFolders";
import { Gallery } from "../components/Gallery";
import { Icon } from "../components/icons";
import { SpaceChooser } from "../components/SpaceChooser";
import { Button, Empty, IconButton, Progress, Segmented } from "../components/ui";
import { getLocalFile, initLocal, supportsFolderHandles, useLocal } from "../lib/local/store";
import { useBackupStatus, useCopyAssets, useDeleteAssets, useLibraryAssets, useMe } from "../lib/queries";
import { mergeItems, type SourceFilter, type TItem } from "../lib/timeline";
import { toast } from "../lib/toast";
import { enqueue } from "../lib/upload/queue";
import { useSetUploadTarget } from "../lib/upload/target";

export function backupJobs(items: TItem[]) {
  return items
    .filter((t) => t.local && !t.cloud)
    .map((t) => ({ name: t.local!.name, size: t.local!.size, getFile: () => getLocalFile(t.local!) }));
}

export function LibraryPage() {
  const me = useMe();
  const local = useLocal();
  const navigate = useNavigate();
  const personal = me.data?.personal ?? undefined;
  const cloud = useLibraryAssets(personal?.id);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [chooser, setChooser] = useState<TItem[] | null>(null);
  const del = useDeleteAssets();
  const copy = useCopyAssets();
  const backup = useBackupStatus(local.items, me.signedIn);

  useEffect(() => void initLocal(), []);
  // 내 사진함 백업은 구독자만 (docs/decisions.md D-016). 구독이 없으면 "올리기"가 안내 창을 연다
  useSetUploadTarget(personal?.id, "내 라이브러리", me.data ? !me.data.subscription.active : false);

  const items = useMemo(() => mergeItems(cloud.assets, local.items, filter), [cloud.assets, local.items, filter]);
  const localOnly = (t: TItem) => !!t.local && !t.cloud && !backup.data?.has(t.local.sha256);

  const backupNow = (sel: TItem[], libraryId = personal?.id, label = "내 라이브러리", shareLocation = false) => {
    if (!me.signedIn) return navigate("/signin?next=/library");
    const jobs = backupJobs(sel);
    if (!libraryId || jobs.length === 0) return;
    enqueue(libraryId, jobs, { shareLocation });
    toast(`${label}에 ${jobs.length}장을 백업하는 중이에요`);
  };

  const removeCloud = (sel: TItem[], clear?: () => void) => {
    const ids = sel.flatMap((t) => (t.cloud ? [t.cloud.id] : []));
    if (!ids.length) return;
    const note = sel.some((t) => t.local) ? "\n(이 PC의 원본 파일은 지워지지 않아요)" : "";
    if (confirm(`nuvo에서 ${ids.length}장을 삭제할까요?${note}`)) del.mutate(ids, { onSuccess: () => clear?.() });
  };

  const total = cloud.assets.length + local.items.length;
  const unbacked = local.items.filter((l) => !backup.data?.has(l.sha256)).length;

  return (
    <>
      <section className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-8">
        <div>
          <h1 className="text-2xl font-light tracking-tight">라이브러리</h1>
          <p className="mt-1 text-sm text-faint">
            {total ? `${items.length.toLocaleString()}장` : "아직 사진이 없어요"}
            {me.signedIn && unbacked > 0 && <span> · 이 PC에만 있는 사진 {unbacked.toLocaleString()}장</span>}
          </p>
        </div>
        {personal && (
          <div className="ml-auto w-48 text-xs text-faint max-sm:ml-0 max-sm:w-full">
            <div className="mb-1.5 flex justify-between">
              <span>nuvo 저장 공간</span>
              <span>
                {formatBytes(personal.usedBytes)} / {formatBytes(personal.quotaBytes)}
              </span>
            </div>
            <Progress value={personal.quotaBytes ? personal.usedBytes / personal.quotaBytes : 0} />
            {personal.quotaBytes > 0 && personal.usedBytes / personal.quotaBytes >= 0.9 && (
              <p className="mt-1.5 text-danger">
                {personal.usedBytes >= personal.quotaBytes ? "저장 공간이 가득 찼어요" : "저장 공간이 거의 찼어요"} · 내가 만든 Space 사진도 포함돼요
              </p>
            )}
          </div>
        )}
      </section>

      {!me.signedIn && !me.sessionPending && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <Icon name="laptop" className="text-faint" />
          <span className="flex-1 text-muted">
            로그인 없이 이 PC의 사진을 보고 있어요. 원본은 PC를 떠나지 않아요.
          </span>
          <Link to="/signin?next=/library">
            <Button size="sm" variant="primary">로그인하고 백업·공유</Button>
          </Link>
        </div>
      )}

      <Gallery
        items={items}
        loading={cloud.isPending && me.signedIn}
        toolbar={
          <>
            {me.signedIn && local.items.length > 0 && (
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "전체" },
                  { value: "cloud", label: "nuvo", icon: "cloud" },
                  { value: "local", label: "이 PC", icon: "laptop" },
                ]}
              />
            )}
            <LocalFolderChips />
            <AddFolderButton />
            {me.signedIn && cloud.assets.length > 1 && (
              <Link to="/library/duplicates">
                <Button variant="ghost" size="sm" icon="layers">중복 정리</Button>
              </Link>
            )}
          </>
        }
        badge={(t) =>
          localOnly(t) ? (
            <span className="absolute bottom-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/45 text-white" title="이 PC에만 있음 · 백업 안 됨">
              <Icon name="laptop" size={12} />
            </span>
          ) : null
        }
        selectionActions={(sel, clear) => {
          const lo = sel.filter((t) => t.local && !t.cloud).length;
          const cl = sel.filter((t) => t.cloud).length;
          return (
            <>
              {lo > 0 && (
                <Button size="sm" variant="primary" icon="cloud" onClick={() => (backupNow(sel), clear())}>
                  nuvo에 백업 {lo}
                </Button>
              )}
              {me.signedIn && (
                <Button size="sm" variant="ghost" icon="users" onClick={() => setChooser(sel)}>
                  Space에 추가
                </Button>
              )}
              {cl > 0 && (
                <Button size="sm" variant="danger" icon="trash" onClick={() => removeCloud(sel, clear)}>
                  삭제
                </Button>
              )}
            </>
          );
        }}
        viewerActions={(t) => (
          <>
            {t.local && !t.cloud && <IconButton icon="cloud" label="nuvo에 백업" onClick={() => backupNow([t])} />}
            {t.cloud && (
              <a
                href={`${t.cloud.urls.original}&dl=${encodeURIComponent(t.cloud.filename ?? "photo")}`}
                aria-label="원본 받기"
                title="원본 받기"
                className="inline-flex size-9 items-center justify-center rounded-full"
              >
                <Icon name="download" />
              </a>
            )}
            {t.cloud && <IconButton icon="trash" label="삭제" onClick={() => removeCloud([t])} />}
          </>
        )}
        empty={
          <Empty icon="photo" title="흩어진 사진을 모아볼까요?">
            <p>이 PC 폴더를 연결하면 업로드 없이 바로 모아 볼 수 있어요.</p>
            {me.signedIn && <p className="mt-1">사진을 끌어다 놓거나 ‘올리기’로 nuvo에 보관할 수도 있어요.</p>}
            <div className="mt-5 flex justify-center">
              <AddFolderButton variant="primary" />
            </div>
            {!supportsFolderHandles() && (
              <p className="mt-4 text-xs text-faint">
                이 브라우저는 폴더를 기억하지 못해서 열 때마다 다시 선택해야 해요. Chrome이나 Edge에서는 한 번만 연결하면 돼요.
              </p>
            )}
          </Empty>
        }
      />

      <SpaceChooser
        open={!!chooser}
        onClose={() => setChooser(null)}
        spaces={me.data?.spaces ?? []}
        onChoose={(s, shareLocation) => {
          const sel = chooser ?? [];
          const ids = sel.flatMap((t) => (t.cloud ? [t.cloud.id] : []));
          if (ids.length) copy.mutate({ assetIds: ids, targetLibraryId: s.libraryId, shareLocation });
          // PC에만 있는 사진은 Space로 바로 올린다 (PC가 꺼져도 가족이 볼 수 있게)
          backupNow(sel, s.libraryId, s.name, shareLocation);
        }}
      />
    </>
  );
}
