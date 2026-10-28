import type { APIRoute } from 'astro';
import { eq, like } from 'drizzle-orm';
import { getAuth } from '../../lib/server/auth';
import { getDb } from '../../lib/server/db';
import { notify } from '../../lib/server/notify';
import { account, letters, session, user, verification } from '../../db/schema';

export const prerender = false;

// 확인 시트에서 입력해야 하는 문자열
const CONFIRM = ['삭제', 'delete'];

/** 계정 삭제 — 세션 + 확인 문자열 둘 다 검증, D1 batch(트랜잭션)로 처리. 레터 본문은 남기고 연결만 끊는다. */
export const DELETE: APIRoute = async ({ request, locals }) => {
  const me = locals.user;
  if (!me) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { confirm?: string };
  if (!CONFIRM.includes(String(body.confirm ?? '').trim().toLowerCase())) {
    return Response.json({ error: 'confirm_mismatch' }, { status: 400 });
  }

  // 로그아웃 응답의 Set-Cookie(세션 쿠키 만료)를 그대로 돌려준다.
  const signOut = await getAuth().api.signOut({ headers: request.headers, asResponse: true });

  const db = getDb();
  await db.batch([
    db.delete(session).where(eq(session.userId, me.id)),
    db.delete(account).where(eq(account.userId, me.id)),
    db.delete(verification).where(like(verification.value, `%"email":"${me.email}"%`)),
    db.update(letters).set({ userId: null, replyTo: null }).where(eq(letters.userId, me.id)),
    db.delete(user).where(eq(user.id, me.id)),
  ]);

  notify('🗑 계정 삭제 1건');

  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of signOut.headers.getSetCookie()) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
