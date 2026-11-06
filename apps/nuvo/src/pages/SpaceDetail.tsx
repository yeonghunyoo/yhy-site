import { formatBytes, REPORT_REASON_LABEL, roleAtLeast, ROLE_LABEL, type Member, type ReportReason, type SpaceRole } from "@nuvo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Gallery } from "../components/Gallery";
import { Icon } from "../components/icons";
import { Avatar, Button, Dialog, Empty, IconButton, Progress, Segmented, Spinner } from "../components/ui";
import { api, unwrap } from "../lib/api";
import { useActivities, useBlocks, useConfig, useCopyAssets, useDeleteAssets, useInvites, useLibraryAssets, useMe, useReports, useSpace, useSpaceLive } from "../lib/queries";
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
  const [dialog, setDialog] = useState<"invite" | "members" | "reports" | null>(null);
  /** 신고 대상: 사진(assetId) 또는 멤버(userId) */
  const [reportTarget, setReportTarget] = useState<{ assetId?: string; userId?: string; label: string } | null>(null);
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
            {isAdmin && s.openReports > 0 && (
              <Button size="sm" variant="danger" icon="flag" onClick={() => setDialog("reports")} data-testid="open-reports">신고 {s.openReports}</Button>
            )}
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
              {t.cloud?.uploadedBy !== myId && (
                <IconButton icon="flag" label="신고" onClick={() => setReportTarget({ assetId: t.cloud!.id, label: "이 사진" })} />
              )}
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
          <div className="mb-1.5 flex justify-between"><span>소유자 저장 공간</span><span>{formatBytes(s.library.usedBytes)} / {formatBytes(s.library.quotaBytes)}</span></div>
          <Progress value={s.library.quotaBytes ? s.library.usedBytes / s.library.quotaBytes : 0} />
          <p className="mt-1.5">이 Space 사진 {formatBytes(s.library.ownBytes)}. Space에 올린 사진은 소유자의 용량을 써요.</p>
          {!s.ownerSubscribed && <p className="mt-1.5 text-danger">소유자의 구독이 끝나 지금은 올릴 수 없어요. 보기는 그대로예요.</p>}
          {s.ownerSubscribed && s.library.quotaBytes > 0 && s.library.usedBytes / s.library.quotaBytes >= 0.9 && (
            <p className="mt-1.5 text-danger" data-testid="storage-warning">
              {s.library.usedBytes >= s.library.quotaBytes ? "저장 공간이 가득 찼어요. 새 사진을 올릴 수 없어요." : "저장 공간이 거의 찼어요."}
              {s.myRole === "owner" ? " 중복 정리로 공간을 늘려 보세요." : " 소유자에게 알려 주세요."}
            </p>
          )}
        </div>
        <Feed activities={feed.data ?? []} />
        {assets.assets.length > 1 && (
          <Link to={`/spaces/${s.id}/duplicates`} className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted hover:text-text">
            <Icon name="layers" size={14} /> 중복 정리
          </Link>
        )}
      </aside>

      <InviteDialog open={dialog === "invite"} onClose={() => setDialog(null)} spaceId={s.id} spaceName={s.name} />
      <MembersDialog
        open={dialog === "members"}
        onClose={() => setDialog(null)}
        spaceId={s.id}
        members={s.members}
        myRole={s.myRole}
        myId={myId}
        onReport={(m) => setReportTarget({ userId: m.id, label: `${m.name}님` })}
      />
      <ReportDialog spaceId={s.id} target={reportTarget} onClose={() => setReportTarget(null)} />
      {isAdmin && <ReportsDialog open={dialog === "reports"} onClose={() => setDialog(null)} spaceId={s.id} />}
    </div>
  );
}

function Feed({ activities }: { activities: { id: string; type: string; actorName: string | null; data: { count?: number; thumbs?: string[]; usedBytes?: number; quotaBytes?: number }; createdAt: number }[] }) {
  if (!activities.length) return <p className="text-xs text-faint">아직 소식이 없어요</p>;
  const text = (a: (typeof activities)[number]) => {
    const n = a.actorName ?? "누군가";
    switch (a.type) {
      case "assets_added": return `${n}님이 사진 ${a.data.count ?? 0}장을 추가했어요`;
      case "assets_removed": return `${n}님이 사진 ${a.data.count ?? 0}장을 삭제했어요`;
      case "member_joined": return `${n}님이 참여했어요`;
      case "storage_full": return `저장 공간이 가득 차서 ${n}님의 사진을 올리지 못했어요. 소유자가 사진을 정리하거나 용량을 늘려야 해요`;
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
  const qc = useQueryClient();
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [url, setUrl] = useState<string | null>(null);
  const active = useInvites(spaceId, open);
  const create = useMutation({
    mutationFn: () => unwrap(api.spaces[":id"].invites.$post({ param: { id: spaceId }, json: { role } })),
    onSuccess: (r) => {
      setUrl(`${location.origin}${r.path}`);
      void qc.invalidateQueries({ queryKey: ["invites", spaceId] });
    },
    onError: toastError,
  });
  const revoke = useMutation({
    mutationFn: (token: string) => unwrap(api.spaces[":id"].invites[":token"].$delete({ param: { id: spaceId, token } })),
    onSuccess: () => {
      toast("초대 링크를 끊었어요");
      setUrl(null);
      void qc.invalidateQueries({ queryKey: ["invites", spaceId] });
    },
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
      {!!active.data?.length && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-xs text-faint">쓰는 중인 초대 링크</h3>
          <ul className="flex flex-col gap-2" data-testid="active-invites">
            {active.data.map((i) => (
              <li key={i.token} className="flex items-center gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-muted">
                  …{i.token.slice(-6)} · {i.role === "editor" ? "함께 올리기" : "보기만"} · {i.uses}/{i.maxUses}명 · {new Date(i.expiresAt).toLocaleDateString()}까지
                </span>
                <Button size="sm" variant="ghost" onClick={() => confirm("이 초대 링크를 끊을까요? 이미 참여한 사람은 그대로예요.") && revoke.mutate(i.token)}>끊기</Button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">링크가 잘못 퍼졌다면 끊고 새로 만드세요.</p>
        </div>
      )}
    </Dialog>
  );
}

function MembersDialog({
  open,
  onClose,
  spaceId,
  members,
  myRole,
  myId,
  onReport,
}: {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  members: Member[];
  myRole: SpaceRole;
  myId?: string;
  onReport: (m: Member) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [removePhotos, setRemovePhotos] = useState(false);
  const blocks = useBlocks(spaceId, open && roleAtLeast(myRole, "admin"));
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
    mutationFn: (v: { userId: string; block?: boolean }) =>
      unwrap(
        api.spaces[":id"].members[":userId"].$delete({
          param: { id: spaceId, userId: v.userId },
          query: { ...(removePhotos && v.userId === myId ? { removePhotos: "1" as const } : {}), ...(v.block ? { block: "1" as const } : {}) },
        }),
      ),
    onSuccess: (_, v) => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["blocks", spaceId] });
      if (v.userId === myId) navigate("/spaces");
    },
    onError: toastError,
  });
  const unblock = useMutation({
    mutationFn: (userId: string) => unwrap(api.spaces[":id"].blocks[":userId"].$delete({ param: { id: spaceId, userId } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["blocks", spaceId] }),
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
                  <IconButton icon="close" label={`${m.name} 내보내기`} onClick={() => confirm(`${m.name}님을 내보낼까요? 올린 사진은 Space에 남아요.`) && removeM.mutate({ userId: m.id })} />
                  <IconButton
                    icon="flag"
                    label={`${m.name} 내보내고 차단`}
                    onClick={() => confirm(`${m.name}님을 내보내고 차단할까요? 초대 링크로 다시 들어올 수 없어요. 올린 사진은 Space에 남아요.`) && removeM.mutate({ userId: m.id, block: true })}
                  />
                </>
              ) : (
                <span className="text-xs text-faint">{ROLE_LABEL[m.role]}</span>
              )}
              {!self && !manageable && (
                <IconButton icon="flag" label={`${m.name} 신고`} onClick={() => onReport(m)} />
              )}
            </li>
          );
        })}
      </ul>
      {!!blocks.data?.length && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-xs text-faint">차단한 사람</h3>
          <ul className="flex flex-col gap-1" data-testid="blocks">
            {blocks.data.map((b) => (
              <li key={b.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <Button size="sm" variant="ghost" onClick={() => confirm(`${b.name}님 차단을 풀까요? 다시 초대할 수 있게 돼요.`) && unblock.mutate(b.id)}>차단 풀기</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 flex flex-col gap-3 border-t border-line pt-4">
        {myRole !== "owner" ? (
          <>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={removePhotos} onChange={(e) => setRemovePhotos(e.target.checked)} />
              내가 올린 사진도 함께 삭제
            </label>
            <Button variant="danger" onClick={() => myId && confirm("이 Space에서 나갈까요?") && removeM.mutate({ userId: myId })}>Space 나가기</Button>
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

const REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

/** 사진·멤버 신고 (스토어 UGC 요건, docs/work-plan.md ⑤). Space 관리자와 운영자에게 전달된다 */
function ReportDialog({ spaceId, target, onClose }: { spaceId: string; target: { assetId?: string; userId?: string; label: string } | null; onClose: () => void }) {
  const config = useConfig();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const close = () => {
    setReason(null);
    setNote("");
    onClose();
  };
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.spaces[":id"].reports.$post({
          param: { id: spaceId },
          json: { assetId: target?.assetId, userId: target?.userId, reason: reason!, note: note.trim() || undefined },
        }),
      ),
    onSuccess: () => {
      toast("신고했어요. Space 관리자와 nuvo 운영자가 확인해요.");
      close();
    },
    onError: toastError,
  });
  return (
    <Dialog open={!!target} onClose={close} title={`${target?.label ?? ""} 신고`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) send.mutate();
        }}
        data-testid="report-form"
      >
        <fieldset className="flex flex-col gap-1.5">
          {REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              {REPORT_REASON_LABEL[r]}
            </label>
          ))}
        </fieldset>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="자세한 내용 (선택)"
          className="rounded-xl border border-line bg-bg px-3 py-2 text-sm"
        />
        {reason === "child_safety" && (
          <p className="text-xs text-danger">아동이 위험한 상황이라면 112에도 바로 신고해 주세요.</p>
        )}
        <p className="text-xs text-faint">
          Space 관리자와 nuvo 운영자에게 전달돼요. 신고한 사람의 이름은 관리자에게 보여요.
          {config.data?.supportEmail && <> 급한 일은 <a className="underline" href={`mailto:${config.data.supportEmail}`}>{config.data.supportEmail}</a>로 알려 주세요.</>}
        </p>
        <Button variant="danger" type="submit" disabled={!reason || send.isPending}>신고하기</Button>
      </form>
    </Dialog>
  );
}

/** 관리자(admin+): 신고 목록과 처리 */
function ReportsDialog({ open, onClose, spaceId }: { open: boolean; onClose: () => void; spaceId: string }) {
  const qc = useQueryClient();
  const reports = useReports(spaceId, open);
  const resolve = useMutation({
    mutationFn: (v: { id: string; status: "resolved" | "dismissed" }) =>
      unwrap(api.spaces[":id"].reports[":reportId"].$post({ param: { id: spaceId, reportId: v.id }, json: { status: v.status } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports", spaceId] });
      void qc.invalidateQueries({ queryKey: ["space", spaceId] });
    },
    onError: toastError,
  });
  return (
    <Dialog open={open} onClose={onClose} title="신고">
      {reports.isPending ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : !reports.data?.length ? (
        <p className="text-sm text-faint">신고가 없어요</p>
      ) : (
        <ul className="flex flex-col gap-4" data-testid="reports">
          {reports.data.map((r) => (
            <li key={r.id} className={`flex gap-3 ${r.status === "open" ? "" : "opacity-50"}`}>
              {r.thumb ? <img src={r.thumb} alt="" className="size-14 shrink-0 rounded-md object-cover" /> : <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-surface text-faint"><Icon name="users" /></span>}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{REPORT_REASON_LABEL[r.reason]}</p>
                <p className="text-xs text-faint">
                  {r.reporterName ?? "떠난 멤버"}님이 신고{r.targetName ? ` · 대상 ${r.targetName}` : ""} · {ago(r.createdAt)}
                </p>
                {r.note && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{r.note}</p>}
                {r.status === "open" ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => resolve.mutate({ id: r.id, status: "resolved" })}>처리함</Button>
                    <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, status: "dismissed" })}>문제 없음</Button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-faint">{r.status === "resolved" ? "처리함" : "문제 없음"}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-faint">사진 삭제나 멤버 내보내기·차단은 사진 보기와 멤버 화면에서 해요. 처리한 뒤 ‘처리함’을 눌러 주세요.</p>
    </Dialog>
  );
}
