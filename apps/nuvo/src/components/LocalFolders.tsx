import { useRef } from "react";
import {
  addFolderSnapshot,
  addFolderWithPicker,
  requestFolderPermission,
  scanFolder,
  supportsFolderHandles,
  useLocal,
} from "../lib/local/store";
import { toastError } from "../lib/toast";
import { Icon } from "./icons";
import { Button, Spinner } from "./ui";

/** 이 PC 폴더 연결 버튼. Chrome/Edge는 폴더 참조, 그 외는 1회 스캔. */
export function AddFolderButton({ variant = "outline" as "outline" | "primary" }) {
  const input = useRef<HTMLInputElement>(null);
  const handles = supportsFolderHandles();
  return (
    <>
      <input
        ref={input}
        type="file"
        className="hidden"
        // @ts-expect-error 비표준 속성 (폴더 선택)
        webkitdirectory=""
        multiple
        data-testid="folder-input"
        onChange={(e) => {
          void addFolderSnapshot(e.target.files ?? []).catch(toastError);
          e.target.value = "";
        }}
      />
      <Button
        variant={variant}
        icon="folder"
        size="sm"
        onClick={() => {
          if (handles) void addFolderWithPicker().catch((e) => e?.name !== "AbortError" && toastError(e));
          else input.current?.click();
        }}
      >
        이 PC 폴더 연결
      </Button>
    </>
  );
}

/** 연결된 폴더 칩: 스캔 진행률, 권한 다시 요청 */
export function LocalFolderChips() {
  const local = useLocal();
  if (local.folders.length === 0) return null;
  return (
    <>
      {local.folders.map((f) => {
        const scan = local.scans[f.id];
        const busy = scan && scan.phase !== "done";
        const perm = local.permissions[f.id];
        return (
          <span key={f.id} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-muted" data-testid="folder-chip">
            <Icon name="laptop" size={14} />
            <span className="max-w-36 truncate text-text">{f.name}</span>
            {busy ? (
              <>
                <Spinner className="size-3" />
                {scan.phase === "listing" ? `찾는 중 ${scan.found}` : `${scan.processed}/${scan.found}`}
              </>
            ) : perm === "prompt" ? (
              <button className="text-accent underline-offset-2 hover:underline" onClick={() => void requestFolderPermission(f.id).then((ok) => { if (ok) void scanFolder(f.id); })}>
                다시 연결
              </button>
            ) : (
              <>
                <span>{f.count}장</span>
                {f.mode === "handle" && (
                  <button aria-label={`${f.name} 다시 읽기`} title="다시 읽기" className="hover:text-text" onClick={() => void scanFolder(f.id)}>
                    <Icon name="refresh" size={13} />
                  </button>
                )}
              </>
            )}
          </span>
        );
      })}
    </>
  );
}
