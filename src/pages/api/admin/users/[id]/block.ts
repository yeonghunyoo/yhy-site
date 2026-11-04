import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { session, user } from '../../../../../db/schema';
import { adminGuard, backTo } from '../../../../../lib/server/admin';
import { isRootAdmin } from '../../../../../lib/server/auth';
import { getDb } from '../../../../../lib/server/db';

export const prerender = false;

/** 차단 토글. 차단하면 관리자 지정도 풀고 세션을 전부 지워 즉시 로그아웃시킨다(차단 중엔 레터 불가, 새 로그인 불가). 최고 관리자는 차단 불가. */
export const POST: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;

  const id = context.params.id!;
  if (id === context.locals.user?.id) return backTo('/admin/users', 'invalid');

  const db = getDb();
  // 최고 관리자(ADMIN_EMAILS)는 차단할 수 없다 — 지정 관리자가 잠그는 일을 막는다
  const target = await db.select({ email: user.email }).from(user).where(eq(user.id, id)).get();
  if (!target || isRootAdmin(target.email)) return backTo('/admin/users', 'invalid');

  const form = await context.request.formData();
  const blocked = form.get('blocked') === '1';
  if (blocked) {
    await db.batch([
      db.update(user).set({ isBlocked: true, isAdmin: false }).where(eq(user.id, id)),
      db.delete(session).where(eq(session.userId, id)),
    ]);
  } else {
    await db.update(user).set({ isBlocked: false }).where(eq(user.id, id));
  }
  return backTo('/admin/users', blocked ? 'blocked' : 'unblocked');
};
