import { createDb, type Db } from "@nuvo/db";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createAuth, type Auth } from "./auth";

export type SessionUser = { id: string; name: string; email: string; image?: string | null };

export type AppEnv = {
  Bindings: Env;
  /**
   * sessionId: 지금 요청의 세션 (로그인 기기 목록에서 "이 기기" 표시용)
   * defer: 응답 뒤에 이어서 할 일 중 **DB를 쓰는 것**(메일 예산 카운터 등). 요청용 DB 연결을 이 일들이 끝난 뒤에 닫는다
   */
  Variables: { db: Db; auth: Auth; user: SessionUser | null; sessionId: string | null; defer: (p: Promise<unknown>) => void };
};

/**
 * 요청마다 DB·인증 인스턴스 생성, 응답 후 커넥션 정리.
 * 응답 뒤로 미룬 일(defer)이 DB를 쓰면, 연결을 먼저 닫았을 때 그 쿼리가 실패한다(운영 인증 메일의 예산 카운터 등).
 * 그래서 미룬 일이 모두 끝난 뒤에 닫는다.
 */
export const withContext = createMiddleware<AppEnv>(async (c, next) => {
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString);
  const deferred: Promise<unknown>[] = [];
  const defer = (p: Promise<unknown>) => {
    const settled = p.catch((e) => console.warn("[defer] failed", e));
    deferred.push(settled);
    c.executionCtx.waitUntil(settled);
  };
  const auth = createAuth(c.env, db, new URL(c.req.url).origin, defer);
  c.set("db", db);
  c.set("auth", auth);
  c.set("user", null);
  c.set("defer", defer);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(Promise.allSettled(deferred).then(() => close()));
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
