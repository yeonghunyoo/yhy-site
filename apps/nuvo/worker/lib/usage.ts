/**
 * 서비스 전체 사용량 상한 — @yhy/cf-kit/budget의 Postgres 저장소.
 * 메일(Resend 무료 하루 100통·월 3,000통 아래): 하루 MAIL_DAILY_CAP(80)·월 MAIL_MONTHLY_CAP(2,800). docs/mvp.md "메일 상한"
 */
import { usageCounter, type Db } from "@nuvo/db";
import { capFrom, createCountBudget, type CounterStore } from "@yhy/cf-kit/budget";
import { and, gt, inArray, sql } from "drizzle-orm";

/** upsert라 동시에 와도 정확히 센다 */
export function pgCounterStore(db: Db): CounterStore {
  return {
    async get(keys) {
      const rows = await db
        .select({ key: usageCounter.key, count: usageCounter.count })
        .from(usageCounter)
        .where(and(inArray(usageCounter.key, keys), gt(usageCounter.expiresAt, sql`now()`)));
      const byKey = new Map(rows.map((r) => [r.key, r.count]));
      return keys.map((k) => byKey.get(k) ?? 0);
    },
    async increment(entries) {
      for (const e of entries) {
        const expiresAt = new Date(Date.now() + e.ttlSeconds * 1000);
        await db
          .insert(usageCounter)
          .values({ key: e.key, count: 1, expiresAt })
          .onConflictDoUpdate({
            target: usageCounter.key,
            // 기한이 지난 행은 1부터 다시 센다
            set: {
              count: sql`case when ${usageCounter.expiresAt} > now() then ${usageCounter.count} + 1 else 1 end`,
              expiresAt: sql`case when ${usageCounter.expiresAt} > now() then ${usageCounter.expiresAt} else excluded.expires_at end`,
            },
          });
      }
    },
  };
}

export const DEFAULT_MAIL_CAPS = { day: 80, month: 2_800 } as const;

export function mailBudget(env: Env, db: Db) {
  return createCountBudget({
    name: "mail",
    caps: { day: capFrom(env.MAIL_DAILY_CAP, DEFAULT_MAIL_CAPS.day), month: capFrom(env.MAIL_MONTHLY_CAP, DEFAULT_MAIL_CAPS.month) },
    store: pgCounterStore(db),
    label: "메일",
    unit: "통",
    // nuvo에는 알림 채널이 없다 — Workers 로그에 남긴다
    alert: async (_kind, level, text) => {
      if (level !== "ok") console.warn(`[budget] ${level === "over" ? "상한 도달" : "80%"}: ${text}`);
    },
  });
}
