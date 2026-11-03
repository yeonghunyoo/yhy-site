import { useEffect, useSyncExternalStore } from "react";

/** 지금 화면에서 "올리기"를 누르면 어느 라이브러리로 갈지 (라이브러리 화면 = 개인, Space 화면 = 그 Space) */
export interface UploadTarget {
  libraryId: string;
  label: string;
}

let target: UploadTarget | null = null;
const listeners = new Set<() => void>();

export function useUploadTargetValue() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => target,
  );
}

export function useSetUploadTarget(libraryId: string | undefined, label: string) {
  useEffect(() => {
    if (!libraryId) return;
    const t = { libraryId, label };
    target = t;
    listeners.forEach((l) => l());
    return () => {
      if (target === t) {
        target = null;
        listeners.forEach((l) => l());
      }
    };
  }, [libraryId, label]);
}
