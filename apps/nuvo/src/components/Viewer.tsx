import { formatBytes } from "@nuvo/shared";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isHeicLike } from "../lib/media/process";
import { mediaPool } from "../lib/media/pool";
import { getLocalFile, requestFolderPermission } from "../lib/local/store";
import { formatDateTime, type TItem } from "../lib/timeline";
import { Icon } from "./icons";
import { useThumbSrc } from "./Thumb";
import { Button, IconButton, Spinner } from "./ui";

/** 보기 화면에 띄울 큰 이미지: nuvo는 2048px 사본, 이 PC 사진은 원본을 직접 읽는다 */
function useFullSrc(item: TItem) {
  const [state, setState] = useState<{ src: string | null; needsPermission: boolean; loading: boolean }>({
    src: item.cloud?.urls.display ?? null,
    needsPermission: false,
    loading: !item.cloud,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (item.cloud) {
      setState({ src: item.cloud.urls.display, needsPermission: false, loading: false });
      return;
    }
    const local = item.local;
    if (!local) return;
    let alive = true;
    let url: string | null = null;
    setState({ src: null, needsPermission: false, loading: true });
    void (async () => {
      const file = await getLocalFile(local);
      if (!alive) return;
      if (!file) {
        setState({ src: null, needsPermission: true, loading: false });
        return;
      }
      try {
        const blob = isHeicLike(file) ? await mediaPool.decodeForView(file) : file;
        url = URL.createObjectURL(blob);
        if (alive) setState({ src: url, needsPermission: false, loading: false });
      } catch {
        if (alive) setState({ src: null, needsPermission: false, loading: false });
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item, nonce]);

  return { ...state, retry: () => setNonce((n) => n + 1) };
}

export function Viewer({
  items,
  index,
  onIndex,
  onClose,
  actions,
  uploaderName,
}: {
  items: TItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  actions?: (item: TItem) => ReactNode;
  uploaderName?: (id: string | null) => string | null;
}) {
  const item = items[index];
  const [info, setInfo] = useState(false);
  const prev = useCallback(() => index > 0 && onIndex(index - 1), [index, onIndex]);
  const next = useCallback(() => index < items.length - 1 && onIndex(index + 1), [index, items.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "i") setInfo((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  // 앞뒤 사진 미리 받기
  useEffect(() => {
    for (const j of [index - 1, index + 1]) {
      const u = items[j]?.cloud?.urls.display;
      if (u) new Image().src = u;
    }
  }, [index, items]);

  const swipe = useRef<{ x: number; y: number } | null>(null);
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-stage text-[oklch(0.92_0.01_80)]"
      role="dialog"
      aria-modal="true"
      aria-label="사진 보기"
      onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) (dx > 0 ? prev : next)();
        else if (dy > 100 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
      }}
    >
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-1 bg-gradient-to-b from-black/50 to-transparent p-2 sm:p-3">
          <IconButton icon="close" label="닫기 (Esc)" onClick={onClose} className="text-white/80 hover:bg-white/10 hover:text-white" />
          <span className="ml-1 truncate text-xs text-white/60">
            {index + 1} / {items.length}
          </span>
          <div className="ml-auto flex items-center gap-1 [&_button]:text-white/80 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
            {actions?.(item)}
            <IconButton icon="info" label="정보 (i)" onClick={() => setInfo((v) => !v)} active={info} />
          </div>
        </div>

        <Stage key={item.key} item={item} />

        {index > 0 && (
          <button
            aria-label="이전 사진"
            onClick={prev}
            className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 sm:flex"
          >
            <Icon name="left" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            aria-label="다음 사진"
            onClick={next}
            className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/80 hover:bg-black/50 sm:flex"
          >
            <Icon name="right" />
          </button>
        )}
      </div>

      {info && <InfoPanel item={item} uploaderName={uploaderName} onClose={() => setInfo(false)} />}
    </div>
  );
}

function Stage({ item }: { item: TItem }) {
  const thumb = useThumbSrc(item);
  const full = useFullSrc(item);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-10">
      {thumb && !loaded && <img src={thumb} alt="" aria-hidden="true" className="absolute max-h-full max-w-full scale-[1.001] object-contain opacity-70 blur-sm" />}
      {full.src && (
        <img
          src={full.src}
          alt={item.cloud?.filename ?? item.local?.name ?? ""}
          onLoad={() => setLoaded(true)}
          draggable={false}
          className={`relative max-h-full max-w-full select-none object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {full.loading && <Spinner className="absolute" />}
      {full.needsPermission && item.local && (
        <div className="absolute bottom-10 flex flex-col items-center gap-3 rounded-2xl bg-black/60 px-5 py-4 text-center text-sm backdrop-blur">
          <p>원본을 보려면 폴더 접근을 다시 허용해 주세요</p>
          <Button
            variant="primary"
            size="sm"
            onClick={async () => (await requestFolderPermission(item.local!.folderId)) && full.retry()}
          >
            폴더 다시 연결
          </Button>
        </div>
      )}
    </div>
  );
}

function InfoPanel({ item, uploaderName, onClose }: { item: TItem; uploaderName?: (id: string | null) => string | null; onClose: () => void }) {
  const c = item.cloud;
  const l = item.local;
  const rows: [string, ReactNode][] = [
    ["촬영", formatDateTime(item.takenAt)],
    ["파일", c?.filename ?? l?.name ?? "—"],
    ["크기", `${item.width ?? "?"} × ${item.height ?? "?"} · ${formatBytes(c?.size ?? l?.size ?? 0)}`],
  ];
  const camera = c?.camera ?? l?.camera;
  if (camera) rows.push(["카메라", camera]);
  const lat = c?.lat ?? l?.lat;
  const lng = c?.lng ?? l?.lng;
  if (lat != null && lng != null) rows.push(["위치", `${lat.toFixed(4)}, ${lng.toFixed(4)}`]);
  const by = uploaderName?.(c?.uploadedBy ?? null);
  if (by) rows.push(["올린 사람", by]);
  rows.push([
    "보관 위치",
    <span key="src" className="flex flex-col gap-1">
      {c && <span className="flex items-center gap-1.5"><Icon name="cloud" size={14} /> nuvo 저장소</span>}
      {l && <span className="flex items-center gap-1.5"><Icon name="laptop" size={14} /> 이 PC · {l.path}</span>}
      {l && !c && <span className="text-[oklch(0.75_0.075_55)]">이 PC에만 있어요 · 백업 안 됨</span>}
    </span>,
  ]);
  return (
    <aside className="flex w-full max-w-xs shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/10 bg-black/40 p-5 text-sm max-sm:absolute max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[60%] max-sm:max-w-none max-sm:border-l-0 max-sm:border-t">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">정보</h2>
        <IconButton icon="close" label="정보 닫기" onClick={onClose} className="text-white/70 hover:bg-white/10" />
      </div>
      <dl className="flex flex-col gap-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-white/50">{k}</dt>
            <dd className="mt-0.5 break-all text-white/90">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
