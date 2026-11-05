import { session } from "@nuvo/db";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireUser, type AppEnv } from "../context";

/** IP는 앞 두 자리만 보여준다 (어깨 너머로 보여도 위치가 좁혀지지 않게) */
function maskIp(ip: string | null) {
  if (!ip) return null;
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".*.*";
  return ip.split(":").slice(0, 2).join(":") + ":…";
}

/** User-Agent → "iPhone · Safari" 같은 짧은 이름 */
function deviceName(ua: string | null) {
  if (!ua) return "알 수 없는 기기";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "기기";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "삼성 인터넷"
      : /KAKAOTALK/i.test(ua)
        ? "카카오톡"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "브라우저";
  return `${os} · ${browser}`;
}

/**
 * 로그인한 기기 목록과 개별 로그아웃 (docs/media-security.md 5.4).
 * Better Auth의 list-sessions는 세션 토큰을 브라우저에 그대로 주므로 쓰지 않고, id만 내보낸다.
 * 세션 쿠키 캐시를 쓰지 않아서(worker/auth.ts) 행을 지우면 그 기기는 다음 요청부터 바로 로그아웃된다.
 */
export const sessionRoutes = new Hono<AppEnv>()
  .get("/", async (c) => {
    const user = requireUser(c);
    const rows = await c.var.db
      .select({ id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt, ip: session.ipAddress, ua: session.userAgent })
      .from(session)
      .where(and(eq(session.userId, user.id), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt));
    return c.json({
      sessions: rows.map((r) => ({
        id: r.id,
        current: r.id === c.var.sessionId,
        device: deviceName(r.ua),
        ip: maskIp(r.ip),
        createdAt: r.createdAt.getTime(),
        lastActiveAt: r.updatedAt.getTime(),
      })),
    });
  })

  /** 다른 기기 하나 로그아웃. 이 기기는 일반 로그아웃을 쓴다 */
  .delete("/:sessionId", async (c) => {
    const user = requireUser(c);
    const id = c.req.param("sessionId");
    if (id === c.var.sessionId) throw new HTTPException(400, { message: "이 기기는 로그아웃 버튼으로 나가 주세요" });
    const out = await c.var.db
      .delete(session)
      .where(and(eq(session.id, id), eq(session.userId, user.id)))
      .returning({ id: session.id });
    if (!out.length) throw new HTTPException(404, { message: "로그인 기록을 찾을 수 없어요" });
    return c.json({ ok: true });
  })

  /** 이 기기만 남기고 모두 로그아웃 */
  .post("/revoke-others", async (c) => {
    const user = requireUser(c);
    const current = c.var.sessionId;
    const out = await c.var.db
      .delete(session)
      .where(current ? and(eq(session.userId, user.id), ne(session.id, current)) : eq(session.userId, user.id))
      .returning({ id: session.id });
    return c.json({ revoked: out.length });
  });
