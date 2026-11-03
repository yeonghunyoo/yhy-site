import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, tone: Toast["tone"] = "info") {
  const t = { id: ++seq, text, tone };
  toasts = [...toasts.slice(-3), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, tone === "error" ? 6000 : 3500);
}

export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : "문제가 생겼어요", "error");

export function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );
}
