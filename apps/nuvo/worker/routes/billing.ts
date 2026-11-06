import { Hono } from "hono";
import type { AppEnv } from "../context";

/**
 * 스토어 결제 서버 간 통지 받는 자리 (docs/work-plan.md ③, docs/service-plan.md "결제 구조"). **구현은 2차 모바일.**
 * 경로를 미리 정해 두는 이유: 스토어 콘솔에 등록하는 주소라 나중에 바꾸기 번거롭다.
 *
 * 2차에서 할 일 (지금은 501만 돌려준다 — 아무것도 믿지 않고 아무것도 바꾸지 않는다):
 * - /api/billing/apple: App Store Server Notifications V2. 본문은 서명된 JWS(signedPayload) — Apple 루트 인증서로
 *   x5c 체인을 검증한 뒤에만 읽는다. originalTransactionId로 subscriptions 행(source "apple")을 찾아 상태·만료일 갱신
 * - /api/billing/google: Real-time developer notifications(Pub/Sub 푸시). Pub/Sub가 붙이는 OIDC 토큰(Authorization)을
 *   검증하고, purchaseToken으로 Google Play Developer API에서 구독 상태를 다시 조회해서 갱신(통지 내용만 믿지 않음)
 * - 두 경로 모두 로그인 세션과 무관(스토어가 부른다). 같은 통지가 여러 번 와도 결과가 같게(멱등) 처리
 * - subscriptionOf(worker/lib/subscription.ts)는 그대로 — 행을 쓰는 쪽만 늘어난다
 */
const notImplemented = (store: string) => (c: { json: (b: unknown, s: 501) => Response }) => {
  console.log(`[billing] ${store} notification received before 2차 — ignored`);
  return c.json({ error: "not_implemented" }, 501);
};

export const billingRoutes = new Hono<AppEnv>().post("/apple", notImplemented("apple")).post("/google", notImplemented("google"));
