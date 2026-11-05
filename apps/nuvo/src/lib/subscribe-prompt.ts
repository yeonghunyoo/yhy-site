import { useSyncExternalStore } from "react";

/**
 * "앱에서 구독" 안내 창 (docs/work-plan.md ⑧). 결제는 앱 스토어에서만 받고 웹은 안내만 한다(docs/decisions.md D-010).
 * 구독이 필요한 기능을 누르거나 서버가 402를 돌려주면 연다. 같은 일로 여러 번 열리지 않게 열려 있으면 무시한다.
 */
export type SubscribeReason = { message: string; ownerExpired?: boolean } | null;

let reason: SubscribeReason = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openSubscribePrompt(message = "구독이 필요한 기능이에요", ownerExpired = false) {
  if (reason) return;
  reason = { message, ownerExpired };
  emit();
}

export function closeSubscribePrompt() {
  reason = null;
  emit();
}

export function useSubscribePrompt() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => reason,
  );
}

/** 서버 402 응답이면 안내 창을 열고 true. Space 소유자 구독 종료는 메시지로 구분한다(worker/lib/subscription.ts) */
export function handlePaymentRequired(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  if (err?.status !== 402) return false;
  openSubscribePrompt(err.message, err.message?.includes("소유자") ?? false);
  return true;
}
