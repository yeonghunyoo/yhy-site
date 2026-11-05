import { subscriptions, type Db } from "@nuvo/db";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Tx } from "./gc";

export type SubscriptionInfo = {
  active: boolean;
  source: "manual" | "apple" | "google" | null;
  status: "active" | "grace" | "expired" | "canceled" | null;
  /** ms. null = 기한 없음 */
  currentPeriodEnd: number | null;
};

/**
 * "이 계정은 구독자인가"를 판단하는 유일한 자리 (docs/work-plan.md ③).
 * active 또는 grace이면서 기간이 남은(또는 기한 없는) 행이 하나라도 있으면 구독자.
 * 웹·앱·업로드 검사가 모두 이 함수만 본다 — 스토어 연동(2차)은 행을 쓰는 쪽만 바뀐다.
 */
export async function subscriptionOf(db: Db | Tx, userId: string): Promise<SubscriptionInfo> {
  const now = new Date();
  const [row] = await db
    .select({ source: subscriptions.source, status: subscriptions.status, end: subscriptions.currentPeriodEnd })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        inArray(subscriptions.status, ["active", "grace"]),
        or(isNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, now)),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);
  if (!row) return { active: false, source: null, status: null, currentPeriodEnd: null };
  return { active: true, source: row.source, status: row.status, currentPeriodEnd: row.end?.getTime() ?? null };
}

export async function isSubscriber(db: Db | Tx, userId: string) {
  return (await subscriptionOf(db, userId)).active;
}

/** 402: 구독이 필요한 기능. 화면은 "앱에서 구독" 안내로 보낸다 (docs/work-plan.md ⑧) */
export const subscriptionRequired = (who: "me" | "owner" = "me") =>
  new HTTPException(402, {
    message: who === "me" ? "구독이 필요한 기능이에요" : "Space 소유자의 구독이 끝나 지금은 올릴 수 없어요",
  });

export async function requireSubscriber(db: Db | Tx, userId: string, who: "me" | "owner" = "me") {
  if (!(await isSubscriber(db, userId))) throw subscriptionRequired(who);
}

/**
 * 운영자가 수동으로 켜는 구독 (1차). 같은 사용자의 manual 행이 있으면 갱신한다.
 * 로컬 /api/dev/subscribe, 운영은 DB 직접 또는 scripts/subscribe.mjs.
 */
export async function setManualSubscription(db: Db | Tx, userId: string, on: boolean, note?: string) {
  const [existing] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.source, "manual")))
    .limit(1);
  const values = { status: on ? ("active" as const) : ("canceled" as const), note: note ?? null, updatedAt: new Date() };
  if (existing) await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
  else await db.insert(subscriptions).values({ userId, source: "manual", ...values });
}
