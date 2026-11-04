import { formatBytes, roleAtLeast, ROLE_LABEL, type Member, type SpaceRole } from "@nuvo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Gallery } from "../components/Gallery";
import { Icon } from "../components/icons";
import { Avatar, Button, Dialog, Empty, IconButton, Progress, Segmented, Spinner } from "../components/ui";
import { api, unwrap } from "../lib/api";
import { useActivities, useCopyAssets, useDeleteAssets, useLibraryAssets, useMe, useSpace, useSpaceLive } from "../lib/queries";
import { mergeItems, type TItem } from "../lib/timeline";
import { toast, toastError } from "../lib/toast";
import { useSetUploadTarget } from "../lib/upload/target";

const rel = new Intl.RelativeTimeFormat("ko", { numeric: "auto" });
function ago(ms: number) {
  const s = (ms - Date.now()) / 1000;
  if (s > -60) return "방금";
  if (s > -3600) return rel.format(Math.round(s / 60), "minute");
  if (s > -86400) return rel.format(Math.round(s / 3600), "hour");
  return rel.format(Math.round(s / 86400), "day");
}

export function SpaceDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const space = useSpace(id);
  const s = space.data;
  const assets = useLibraryAssets(s?.library.id);
  const feed = useActivities(id);
  const del = useDeleteAssets();
  const copy = useCopyAssets();
  const [who, setWho] = useState<string>("all");
  const [dialog, setDialog] = useState<"invite" | "members" | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const myId = me.data?.user.id;

  useSpaceLive(id, s?.library.id, myId);
  useSetUploadTarget(s && roleAtLeast(s.myRole, "editor") ? s.library.id : undefined, s?.name ?? "");

  const nameOf = useMemo(() => {
    const m = new Map(s?.members.map((x) => [x.id, x.name]));
    return (uid: string | null) => (uid ? (m.get(uid) ?? "떠난 멤버") : null);
  }, [s?.members]);
  const items = useMemo(() => {
    const all = mergeItems(assets.assets, []);
    return who === "all" ? all : all.filter((t) => t.cloud?.uploadedBy === who);
  }, [assets.assets, who]);

  if (space.isPending) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!s) return <Empty icon="users" title="Space를 찾을 수 없어요">초대 링크로 다시 들어와 주세요.</Empty>;

  const isAdmin = roleAtLeast(s.myRole, "admin");
  const canDelete = (t: TItem) => isAdmin || (roleAtLeast(s.myRole, "editor") && t.cloud?.uploadedBy === myId);
  const remove = (sel: TItem[], clear?: () => void) => {
    const ids = sel.filter(canDelete).map((t) => t.cloud!.id);
    if (!ids.length) return toast("내가 올린 사진만 삭제할 수 있어요", "error");
    if (confirm(`Space에서 ${ids.length}장을 삭제할까요? 모든 멤버에게서 사라져요.`)) del.mutate(ids, { onSuccess: () => clear?.() });
  };
  const saveToMine = (sel: TItem[]) => {
    const personal = me.data?.personal;
    if (personal) copy.mutate({ assetIds: sel.map((t) => t.cloud!.id), targetLibraryId: personal.id });
  };

  return (
    <div className="flex gap-8">
      <div className="min-w-0 flex-1">
        <section className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-8">
          <div className="min-w-0">
            <Link to="/spaces" className="text-xs text-faint hover:text-muted">Space</Link>
            <h1 className="truncate text-2xl font-light tracking-tight" data-testid="space-name">{s.name}</h1>
            <button className="mt-2 flex items-center gap-2" onClick={() => setDialog("members")} aria-label="멤버 보기">
              <span className="flex -space-x-1.5">
                {s.members.slice(0, 6).map((m) => (
                  <span key={m.id} className="rounded-full ring-2 ring-bg"><Avatar name={m.name} image={m.image} size={24} /></span>
                ))}
              </span>
              <span className="text-xs text-faint">{s.members.length}명 · {ROLE_LABEL[s.myRole]}</span>
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 max-sm:ml-0">
            {isAdmin && <Button size="sm" icon="link" onClick={() => setDialog("invite")}>초대</Button>}
            <Button size="sm" variant="ghost" icon="users" onClick={() => setDialog("members")}>멤버</Button>
            <Button size="sm" variant="ghost" icon="layers" className="xl:hidden" onClick={() => setFeedOpen((v) => !v)}>소식</Button>
          </div>
        </section>

        {feedOpen && <div className="mt-4 rounded-2xl border border-line p-4 xl:hidden"><Feed activities={feed.data ?? []} /></div>}

        <Gallery
          items={items}
          loading={assets.isPending}
          uploaderName={nameOf}
          toolbar={
            s.members.length > 1 && (
              <Segmented
                value={who}
                onChange={setWho}
                options={[{ value: "all", label: "모두" }, ...s.members.map((m) => ({ value: m.id, label: m.id === myId ? "나" : m.name }))]}
              />
            )
          }
          badge={(t) =>
            s.members.length > 1 && t.cloud?.uploadedBy ? (
              <span className="absolute bottom-1.5 left-1.5 rounded-full ring-1 ring-black/10">
                <Avatar name={nameOf(t.cloud.uploadedBy) ?? "?"} size={18} />
              </span>
            ) : null
          }
          selectionActions={(sel, clear) => (
            <>
              <Button size="sm" variant="ghost" icon="copy" onClick={() => (saveToMine(sel), clear())}>내 라이브러리에 저장</Button>
              {sel.some(canDelete) && <Button size="sm" variant="danger" icon="trash" onClick={() => remove(sel, clear)}>삭제</Button>}
            </>
          )}
          viewerActions={(t) => (
            <>
              <a href={`${t.cloud!.urls.original}&dl=${encodeURIComponent(t.cloud!.filename ?? "photo")}`} aria-label="원본 받기" title="원본 받기" className="inline-flex size-9 items-center justify-center rounded-full">
                <Icon name="download" />
              </a>
              <IconButton icon="copy" label="내 라이브러리에 저장" onClick={() => saveToMine([t])} />
              {canDelete(t) && <IconButton icon="trash" label="삭제" onClick={() => remove([t])} />}
            </>
          )}
          empty={
            <Empty icon="photo" title="아직 사진이 없어요">
              {roleAtLeast(s.myRole, "editor") ? "사진을 끌어다 놓거나 ‘올리기’를 눌러 첫 사진을 올려 보세요." : "멤버들이 사진을 올리면 여기에 보여요."}
              {isAdmin && s.members.length === 1 && (
                <div className="mt-5"><Button variant="primary" icon="link" onClick={() => setDialog("invite")}>가족 초대하기</Button></div>
              )}
            </Empty>
          }
        />
      </div>

      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 overflow-y-auto pt-8 xl:block">
        <div className="mb-6 text-xs text-faint">
          <div className="mb-1.5 flex justify-between"><span>Space 저장 공간</span><span>{formatBytes(s.library.usedBytes)} / {formatBytes(s.library.quotaBytes)}</span></div>
          <Progress value={s.library.usedBytes / s.library.quotaBytes} />
        </div>
        <Feed activities={feed.data ?? []} />
        {assets.assets.length > 1 && (
          <Link to={`/spaces/${s.id}/duplicates`} className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-text">
            <Icon name="layers" size={14} /> 중복 정리
          </Link>
        )}
      </aside>

      <InviteDialog open={dialog === "invite"} onClose={() => setDialog(null)} spaceId={s.id} spaceName={s.name} />
      <MembersDialog open={dialog === "members"} onClose={() => setDialog(null)} spaceId={s.id} members={s.members} myRole={s.myRole} myId={myId} />
    </div>
  );
}

function Feed({ activities }: { activities: { id: string; type: string; actorName: string | null; data: { count?: number; thumbs?: string[] }; createdAt: number }[] }) {
  if (!activities.length) return <p className="text-xs text-faint">아직 소식이 없어요</p>;
  const text = (a: (typeof activities)[number]) => {
    const n = a.actorName ?? "누군가";
    switch (a.type) {
      case "assets_added": return `${n}님이 사진 ${a.data.count ?? 0}장을 추가했어요`;
      case "assets_removed": return `${n}님이 사진 ${a.data.count ?? 0}장을 삭제했어요`;
      case "member_joined": return `${n}님이 참여했어요`;
      default: return `${n}님이 나갔어요`;
    }
  };
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium">소식</h2>
      <ol className="flex flex-col gap-4" data-testid="feed">
        {activities.map((a) => (
          <li key={a.id} className="text-sm">
            <p className="leading-snug">{text(a)}</p>
            <p className="mt-0.5 text-xs text-faint">{ago(a.createdAt)}</p>
            {!!a.data.thumbs?.length && (
              <div className="mt-2 flex gap-1">
                {a.data.thumbs.slice(0, 4).map((u) => <img key={u} src={u} alt="" className="size-12 rounded-md object-cover" loading="lazy" />)}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function InviteDialog({ open, onClose, spaceId, spaceName }: { open: boolean; onClose: () => void; spaceId: string; spaceName: string }) {
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [url, setUrl] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => unwrap(api.spaces[":id"].invites.$post({ param: { id: spaceId }, json: { role } })),
    onSuccess: (r) => setUrl(`${location.origin}${r.path}`),
    onError: toastError,
  });
  const close = () => {
    setUrl(null);
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title={`‘${spaceName}’에 초대`}>
      {!url ? (
        <div className="flex flex-col gap-4">
          <Segmented value={role} onChange={setRole} options={[{ value: "editor", label: "함께 올리기" }, { value: "viewer", label: "보기만" }]} />
          <p className="text-xs text-faint">링크는 7일 동안, 최대 10명까지 쓸 수 있어요.</p>
          <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending}>초대 링크 만들기</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input readOnly value={url} className="h-10 rounded-xl border border-line bg-bg px-3 text-xs" onFocus={(e) => e.target.select()} data-testid="invite-url" />
          <div className="flex gap-2">
            <Button className="flex-1" icon="copy" onClick={() => void navigator.clipboard.writeText(url).then(() => toast("링크를 복사했어요"))}>복사</Button>
            {"share" in navigator && (
              <Button className="flex-1" variant="primary" onClick={() => void navigator.share({ title: `nuvo · ${spaceName}`, text: `‘${spaceName}’에서 함께 사진을 모아요`, url })}>
                공유
              </Button>
            )}
          </div>
          <p className="text-xs text-faint">카카오톡·문자로 보내면, 받은 사람이 로그인 후 바로 참여해요.</p>
        </div>
      )}
    </Dialog>
  );
}

function MembersDialog({ open, onClose, spaceId, members, myRole, myId }: { open: boolean; onClose: () => void; spaceId: string; members: Member[]; myRole: SpaceRole; myId?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [removePhotos, setRemovePhotos] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["space", spaceId] });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: SpaceRole }) => unwrap(api.spaces[":id"].members[":userId"].$patch({ param: { id: spaceId, userId: v.userId }, json: { role: v.role } })),
    onSuccess: refresh,
    onError: toastError,
  });
  const removeM = useMutation({
    mutationFn: (userId: string) => unwrap(api.spaces[":id"].members[":userId"].$delete({ param: { id: spaceId, userId }, query: removePhotos ? { removePhotos: "1" } : {} })),
    onSuccess: (_, userId) => {
      refresh();
      if (userId === myId) navigate("/spaces");
    },
    onError: toastError,
  });
  const delSpace = useMutation({
    mutationFn: () => unwrap(api.spaces[":id"].$delete({ param: { id: spaceId } })),
    onSuccess: () => {
      refresh();
      navigate("/spaces");
    },
    onError: toastError,
  });
  const isOwner = myRole === "owner";
  const isAdmin = roleAtLeast(myRole, "admin");

  return (
    <Dialog open={open} onClose={onClose} title="멤버">
      <ul className="flex flex-col gap-1" data-testid="members">
        {members.map((m) => {
          const self = m.id === myId;
          const manageable = !self && m.role !== "owner" && (isOwner || (isAdmin && m.role !== "admin"));
          return (
            <li key={m.id} className="flex items-center gap-3 rounded-xl py-1.5">
              <Avatar name={m.name} image={m.image} size={32} />
              <span className="min-w-0 flex-1 truncate text-sm">{m.name}{self && <span className="text-faint"> (나)</span>}</span>
              {manageable ? (
                <>
                  <select
                    aria-label={`${m.name} 역할`}
                    value={m.role}
                    onChange={(e) => {
                      const role = e.target.value as SpaceRole;
                      if (role === "owner" && !confirm(`${m.name}님에게 소유권을 넘길까요? 나는 관리자가 돼요.`)) return;
                      setRole.mutate({ userId: m.id, role });
                    }}
                    className="h-8 rounded-lg border border-line bg-bg px-2 text-xs"
                  >
                    {isOwner && <option value="owner">소유권 넘기기</option>}
                    {isOwner && <option value="admin">{ROLE_LABEL.admin}</option>}
                    <option value="editor">{ROLE_LABEL.editor}</option>
                    <option value="viewer">{ROLE_LABEL.viewer}</option>
                  </select>
                  <IconButton icon="close" label={`${m.name} 내보내기`} onClick={() => confirm(`${m.name}님을 내보낼까요? 올린 사진은 Space에 남아요.`) && removeM.mutate(m.id)} />
                </>
              ) : (
                <span className="text-xs text-faint">{ROLE_LABEL[m.role]}</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4">
        {myRole !== "owner" ? (
          <>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={removePhotos} onChange={(e) => setRemovePhotos(e.target.checked)} />
              내가 올린 사진도 함께 삭제
            </label>
            <Button variant="danger" onClick={() => myId && confirm("이 Space에서 나갈까요?") && removeM.mutate(myId)}>Space 나가기</Button>
          </>
        ) : (
          <>
            <p className="text-xs text-faint">소유자는 나가기 전에 다른 멤버에게 소유권을 넘겨야 해요.</p>
            <Button variant="danger" onClick={() => confirm("Space와 모든 사진을 삭제할까요? 되돌릴 수 없어요.") && delSpace.mutate()}>Space 삭제</Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
