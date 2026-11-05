import { createDb, type Db } from "@nuvo/db";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createAuth, type Auth } from "./auth";

export type SessionUser = { id: string; name: string; email: string; image?: string | null };

export type AppEnv = {
  Bindings: Env;
  /** sessionId: 지금 요청의 세션 (로그인 기기 목록에서 "이 기기" 표시용) */
  Variables: { db: Db; auth: Auth; user: SessionUser | null; sessionId: string | null };
};

/** 요청마다 DB·인증 인스턴스 생성, 응답 후 커넥션 정리 */
export const withContext = createMiddleware<AppEnv>(async (c, next) => {
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  const auth = createAuth(c.env, db, new URL(c.req.url).origin, (p) => c.executionCtx.waitUntil(p));
  c.set("db", db);
  c.set("auth", auth);
  c.set("user", null);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(close());
  }
});

export const withSession = createMiddleware<AppEnv>(async (c, next) => {
  const s = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", s?.user ?? null);
  c.set("sessionId", s?.session.id ?? null);
  await next();
});

export function requireUser(c: { var: { user: SessionUser | null } }): SessionUser {
  const u = c.var.user;
  if (!u) throw new HTTPException(401, { message: "로그인이 필요해요" });
  return u;
}
