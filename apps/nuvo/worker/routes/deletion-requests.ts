import { deletionRequests } from "@nuvo/db";
import { DeletionRequestInput } from "@nuvo/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../context";
import { sendMail } from "../lib/mail";
import { mailBudget } from "../lib/usage";
import { validate } from "../lib/validate";

/** 서비스 전체로 한 시간에 받을 요청 수 (로그인 없이 열린 경로라 남용을 막는다) */
const HOURLY_LIMIT = 30;

/**
 * 로그인할 수 없는 사람의 계정 삭제 요청 (Google Play: 앱 밖 웹에서 삭제를 요청할 수 있어야 한다).
 * 로그인할 수 있으면 /account/delete 화면에서 바로 지운다 — 이 경로는 그 밖의 경우만.
 * - 요청은 저장하고 운영자에게 메일(SUPPORT_EMAIL). 운영자가 그 이메일로 본인 확인 후 처리한다
 * - 가입 여부를 드러내지 않도록 응답은 항상 같다. 같은 이메일은 하루 한 번만 저장한다
 */
export const deletionRequestRoutes = new Hono<AppEnv>().post("/", validate("json", DeletionRequestInput), async (c) => {
  const db = c.var.db;
  const { email, note } = c.req.valid("json");
  const now = Date.now();

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deletionRequests)
    .where(gte(deletionRequests.createdAt, new Date(now - 3600_000)));
  if (n >= HOURLY_LIMIT) throw new HTTPException(429, { message: "요청이 많아요. 잠시 후 다시 시도하거나 지원 메일로 알려 주세요." });

  const [dup] = await db
    .select({ id: deletionRequests.id })
    .from(deletionRequests)
    .where(and(eq(deletionRequests.email, email), gte(deletionRequests.createdAt, new Date(now - 86400_000))))
    .limit(1);
  if (!dup) {
    const [row] = await db.insert(deletionRequests).values({ email, note: note || null }).returning({ id: deletionRequests.id });
    const to = c.env.SUPPORT_EMAIL;
    if (to) {
      const text = [`계정 삭제 요청 id: ${row!.id}`, `이메일: ${email}`, note ? `내용: ${note}` : null, "", "본인 확인 메일을 보낸 뒤 처리하세요 (docs/developer-guide.md \"계정 삭제 요청\")."]
        .filter((l) => l !== null)
        .join("\n");
      const html = `<pre style="font:14px/1.6 monospace">${text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)}</pre>`;
      c.executionCtx.waitUntil(
        sendMail(c.env, { to, subject: "nuvo 계정 삭제 요청", text, html }, mailBudget(c.env, db)).catch((e) =>
          console.warn("[deletion-request] mail failed", e),
        ),
      );
    }
    console.log(`[deletion-request] ${row!.id}`);
  }
  return c.json({ ok: true }, 202);
});
