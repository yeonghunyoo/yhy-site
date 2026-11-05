import type { Activity, CloudAsset, HubEvent, Member, SpaceReport, SpaceRole } from "@nuvo/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api, unwrap } from "./api";
import { useSession } from "./auth";
import type { LocalItem } from "./local/db";
import { toast, toastError } from "./toast";

export function useAuthConfig() {
  return useQuery({ queryKey: ["auth-config"], queryFn: () => unwrap(api["auth-config"].$get()), staleTime: Infinity });
}

/** 공개 설정 (지원 연락처). 로그인 없이도 */
export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => unwrap(api.config.$get()), staleTime: Infinity });
}

/** 관리자: Space 신고 목록 */
export function useReports(spaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["reports", spaceId],
    enabled: !!spaceId && enabled,
    queryFn: async () => (await unwrap(api.spaces[":id"].reports.$get({ param: { id: spaceId! } }))).reports as SpaceReport[],
  });
}

/** 관리자: Space 차단 목록 */
export function useBlocks(spaceId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["blocks", spaceId],
    enabled: !!spaceId && enabled,
    queryFn: async () => (await unwrap(api.spaces[":id"].blocks.$get({ param: { id: spaceId! } }))).blocks,
  });
}

export function useMe() {
  const session = useSession();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => unwrap(api.me.$get()),
    enabled: !!session.data?.user,
  });
  return { ...q, signedIn: !!session.data?.user, sessionPending: session.isPending };
}

/** 라이브러리 전체 사진 (페이지를 끝까지 자동으로 불러온다) */
export function useLibraryAssets(libraryId: string | undefined) {
  const q = useInfiniteQuery({
    queryKey: ["assets", libraryId],
    enabled: !!libraryId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.libraries[":id"].assets.$get({
          param: { id: libraryId! },
          query: { limit: "500", ...(pageParam ? { cursor: pageParam } : {}) },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 5 * 60_000,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const assets = useMemo(() => (q.data?.pages.flatMap((p) => p.assets) ?? []) as CloudAsset[], [q.data]);
  return { ...q, assets, complete: !hasNextPage && !q.isPending };
}

export function useSpace(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["space", spaceId],
    enabled: !!spaceId,
    queryFn: () => unwrap(api.spaces[":id"].$get({ param: { id: spaceId! } })) as Promise<{
      id: string;
      name: string;
      myRole: SpaceRole;
      /** usedBytes·quotaBytes는 소유자 것(개인 + 소유 Space 합), ownBytes는 이 Space만 */
      library: { id: string; type: "space"; usedBytes: number; quotaBytes: number; ownBytes: number };
      ownerSubscribed: boolean;
      openReports: number;
      members: Member[];
    }>,
  });
}

export function useActivities(spaceId: string | undefined) {
  return useQuery({
    queryKey: ["activities", spaceId],
    enabled: !!spaceId,
    queryFn: async () => (await unwrap(api.spaces[":id"].activities.$get({ param: { id: spaceId! } }))).activities as Activity[],
  });
}

/** 로컬 사진 중 nuvo 어딘가(접근 가능한 라이브러리)에 이미 있는 것 */
export function useBackupStatus(local: LocalItem[], enabled: boolean) {
  const shas = useMemo(() => [...new Set(local.map((l) => l.sha256))].sort(), [local]);
  return useQuery({
    queryKey: ["backup-status", shas.length, shas[0], shas.at(-1)],
    enabled: enabled && shas.length > 0,
    queryFn: async () => {
      const out = new Set<string>();
      for (let i = 0; i < shas.length; i += 1000) {
        const r = await unwrap(api["backup-status"].$post({ json: { sha256s: shas.slice(i, i + 1000) } }));
        r.backedUp.forEach((s) => out.add(s));
      }
      return out;
    },
    staleTime: 60_000,
  });
}

export function useDeleteAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assetIds: string[]) => unwrap(api.assets.delete.$post({ json: { assetIds } })),
    onSuccess: (r) => {
      toast(r.denied ? `${r.removed}장 삭제 (${r.denied}장은 권한이 없어요)` : `${r.removed}장을 삭제했어요`);
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["me"] });
      void qc.invalidateQueries({ queryKey: ["space"] });
      void qc.invalidateQueries({ queryKey: ["backup-status"] });
    },
    onError: toastError,
  });
}

export function useCopyAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { assetIds: string[]; targetLibraryId: string }) => unwrap(api.assets.copy.$post({ json: v })),
    onSuccess: (r, v) => {
      toast(r.skipped ? `${r.added}장 추가 (${r.skipped}장은 이미 있어요)` : `${r.added}장을 추가했어요`);
      void qc.invalidateQueries({ queryKey: ["assets", v.targetLibraryId] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: toastError,
  });
}

/** Space 실시간: 다른 멤버가 사진을 올리면 바로 반영하고 알려준다 */
export function useSpaceLive(spaceId: string | undefined, libraryId: string | undefined, myId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!spaceId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 1000;
    let ping: ReturnType<typeof setInterval> | undefined;
    // 여러 장을 올리면 파일마다 이벤트가 온다 → 2초 모아서 한 번만 알린다
    const pending = new Map<string, { name: string; added: number; removed: number }>();
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      for (const p of pending.values()) {
        if (p.added) toast(`${p.name}님이 사진 ${p.added}장을 추가했어요`);
        if (p.removed) toast(`${p.name}님이 사진 ${p.removed}장을 삭제했어요`);
      }
      pending.clear();
    };
    // Space에서 빠졌거나 Space가 삭제됨 → 다시 연결하지 않고 화면 정보를 새로 받는다
    const removed = () => {
      closed = true;
      void qc.invalidateQueries({ queryKey: ["space", spaceId] });
      void qc.invalidateQueries({ queryKey: ["me"] });
    };
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/spaces/${spaceId}/live`);
      ws.onopen = () => {
        retry = 1000;
        ping = setInterval(() => ws?.readyState === 1 && ws.send("ping"), 30_000);
      };
      ws.onmessage = (e) => {
        if (e.data === "pong") return;
        const ev = JSON.parse(e.data) as HubEvent;
        if (ev.type === "removed") {
          removed();
          ws?.close();
        } else if (ev.type === "assets_changed") {
          void qc.invalidateQueries({ queryKey: ["assets", libraryId] });
          void qc.invalidateQueries({ queryKey: ["activities", spaceId] });
          void qc.invalidateQueries({ queryKey: ["space", spaceId] });
          if (ev.actorId !== myId) {
            const p = pending.get(ev.actorId) ?? { name: ev.actorName, added: 0, removed: 0 };
            p[ev.action] += ev.count;
            pending.set(ev.actorId, p);
            clearTimeout(flushTimer);
            flushTimer = setTimeout(flush, 2000);
          }
        } else {
          void qc.invalidateQueries({ queryKey: ["space", spaceId] });
          void qc.invalidateQueries({ queryKey: ["activities", spaceId] });
        }
      };
      ws.onclose = (e) => {
        clearInterval(ping);
        if (e.code === 4403) return removed();
        if (!closed) setTimeout(connect, (retry = Math.min(retry * 2, 30_000)));
      };
    };
    connect();
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(flushTimer);
      ws?.close();
    };
  }, [spaceId, libraryId, myId, qc]);
}
