import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useMe } from "../lib/queries";
import { toast, useToasts } from "../lib/toast";
import { clearFinished, enqueueFiles, useUploads } from "../lib/upload/queue";
import { openSubscribePrompt } from "../lib/subscribe-prompt";
import { useUploadTargetValue } from "../lib/upload/target";
import { SubscribePrompt } from "./SubscribePrompt";
import { Icon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar, Button, IconButton, Progress } from "./ui";

function startUpload(libraryId: string, label: string, files: File[]) {
  const { accepted, rejected } = enqueueFiles(libraryId, files);
  if (accepted) toast(`${label}에 ${accepted}장을 올리는 중이에요`);
  if (rejected) toast(`${rejected}개는 지원하지 않는 형식이라 건너뛰었어요 (MVP는 사진만)`, "error");
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const target = useUploadTargetValue();
  const fileRef = useRef<HTMLInputElement>(null);

  const nav = (to: string, label: string, icon: "photo" | "users") => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
          isActive ? "bg-surface text-text" : "text-muted hover:text-text"
        }`
      }
    >
      <Icon name={icon} size={17} />
      <span className="max-sm:hidden">{label}</span>
    </NavLink>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-3 sm:px-5">
          <Link to="/library" className="mr-2 text-lg font-light tracking-[0.25em] sm:mr-4">
            nuvo
          </Link>
          {nav("/library", "라이브러리", "photo")}
          {me.signedIn && nav("/spaces", "Space", "users")}
          <div className="ml-auto flex items-center gap-1">
            {target && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  data-testid="upload-input"
                  onChange={(e) => {
                    startUpload(target.libraryId, target.label, [...(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="primary"
                  icon="upload"
                  size="sm"
                  onClick={() => (target.needsSubscription ? openSubscribePrompt() : fileRef.current?.click())}
                  className="mr-1"
                >
                  <span className="max-sm:hidden">올리기</span>
                </Button>
              </>
            )}
            <ThemeToggle />
            {me.signedIn ? (
              <Link to="/settings" aria-label="설정" title="설정" className="ml-1 rounded-full">
                <Avatar name={me.data?.user.name ?? "?"} image={me.data?.user.image} size={30} />
              </Link>
            ) : (
              <>
                <Link to="/settings" aria-label="설정" title="설정" className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text">
                  <Icon name="settings" />
                </Link>
                <Link to="/signin" className="ml-1">
                  <Button size="sm">로그인</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-3 pb-28 sm:px-5">{children}</main>
      {target && (
        <DropZone
          onFiles={(f) => (target.needsSubscription ? openSubscribePrompt() : startUpload(target.libraryId, target.label, f))}
          label={target.label}
        />
      )}
      <UploadPanel />
      <Toasts />
      <SubscribePrompt />
    </div>
  );
}

/** 창 어디에든 사진을 끌어다 놓으면 현재 라이브러리로 업로드 */
function DropZone({ onFiles, label }: { onFiles: (files: File[]) => void; label: string }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      onFiles([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);
  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-bg/80 backdrop-blur-sm">
      <p className="text-lg font-light">
        <b className="font-medium">{label}</b>에 놓아서 올리기
      </p>
    </div>
  );
}

function UploadPanel() {
  const items = useUploads();
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const done = items.filter((i) => i.status === "done" || i.status === "skipped").length;
  const failed = items.filter((i) => i.status === "error").length;
  const busy = items.some((i) => !["done", "skipped", "error"].includes(i.status));
  const total = items.reduce((s, i) => s + i.size, 0) || 1;
  const loaded = items.reduce((s, i) => s + (i.status === "done" || i.status === "skipped" ? i.size : i.loaded), 0);
  const label: Record<string, string> = {
    queued: "대기",
    processing: "준비 중",
    uploading: "올리는 중",
    done: "완료",
    skipped: "이미 있음",
    error: "실패",
  };
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[min(92vw,340px)] rounded-2xl border border-line bg-surface shadow-xl" data-testid="upload-panel">
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {busy ? `올리는 중 ${done}/${items.length}` : `업로드 완료 ${done}장`}
            {failed > 0 && <span className="ml-2 text-danger">실패 {failed}</span>}
          </p>
          <Progress value={loaded / total} className="mt-2" />
        </div>
        <IconButton icon={open ? "close" : "layers"} label={open ? "목록 닫기" : "목록 보기"} onClick={() => setOpen((v) => !v)} />
        {!busy && <IconButton icon="check" label="지우기" onClick={clearFinished} />}
      </div>
      {open && (
        <ul className="max-h-64 overflow-y-auto border-t border-line px-4 py-2 text-xs">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className={i.status === "error" ? "text-danger" : "text-faint"} title={i.error}>
                {i.status === "error" ? i.error : label[i.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toasts() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-full px-4 py-2 text-sm shadow-lg ${t.tone === "error" ? "bg-danger text-accent-ink" : "bg-text text-bg"}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
