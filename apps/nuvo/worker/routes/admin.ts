import { user as userTable } from "@nuvo/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../context";
import { deleteAccount, planAccountDeletion } from "../lib/account";
import { validate } from "../lib/validate";

/** 운영자 토큰이 너무 짧거나 개발용 값이면 운영에서 쓰지 않는다 */
const MIN_TOKEN = 32;
const DEV_TOKEN_PREFIX = "dev-only";

async function sameToken(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

/**
 * 운영자 전용 (docs/work-plan.md ⑦, docs/developer-guide.md "계정 삭제 요청"). 로그인 세션이 아니라 `ADMIN_TOKEN`으로 부른다.
 * 토큰이 없거나(기본) 맞지 않으면 404 — 경로가 있는지도 드러내지 않는다. 운영에서는 개발용·짧은 토큰을 거부한다.
 * 사용: scripts/admin-delete-account.mjs (기본은 미리보기, --yes일 때만 지움)
 */
export const adminRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    const want = c.env.ADMIN_TOKEN ?? "";
    const prod = c.env.ENVIRONMENT === "production";
    const usable = want.length > 0 && (!prod || (want.length >= MIN_TOKEN && !want.startsWith(DEV_TOKEN_PREFIX)));
    const got = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!usable || !got || !(await sameToken(got, want))) throw new HTTPException(404, { message: "Not Found" });
    await next();
  })

  /**
   * 계정 삭제. dryRun이면 계획만 돌려준다. transferShared면 공유 Space 소유권을 가장 오래된 관리자 → 참여자 → 보기만 멤버에게 넘긴다.
   * 본인 확인(요청한 이메일로 답장 받기)은 운영자가 이 호출 전에 한다
   */
  .post(
    "/delete-account",
    validate("json", z.object({ email: z.string().trim().toLowerCase().email(), transferShared: z.boolean().optional(), dryRun: z.boolean().optional() })),
    async (c) => {
      const { email, transferShared, dryRun } = c.req.valid("json");
      const db = c.var.db;
      const [u] = await db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(eq(userTable.email, email)).limit(1);
      if (!u) return c.json({ found: false }, 404);
      const plan = await planAccountDeletion(db, u.id);
      if (dryRun) return c.json({ found: true, dryRun: true, name: u.name, plan });
      await deleteAccount(c.env, db, plan, { transferShared, defer: c.var.defer });
      console.log(`[admin] account deleted ${u.id}`);
      return c.json({ found: true, deleted: true, plan });
    },
  );
