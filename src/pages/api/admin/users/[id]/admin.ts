import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { session, user } from '../../../../../db/schema';
import { adminGuard, backTo } from '../../../../../lib/server/admin';
import { isRootAdmin } from '../../../../../lib/server/auth';
import { getDb } from '../../../../../lib/server/db';
import { maskEmail, notify } from '../../../../../lib/server/notify';

export const prerender = false;

/**
 * 관리자 지정·해제(docs/04-admin.md "관리자 지정"). 자기 자신·최고 관리자(ADMIN_EMAILS)·차단된 사용자는 바꿀 수 없다.
 * 해제하면 세션을 지워 바로 로그아웃시킨다. 지정·해제마다 Telegram 알림.
 */
export const POST: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;

  const id = context.params.id!;
  if (id === context.locals.user?.id) return backTo('/admin/users', 'invalid');

  const db = getDb();
  const target = await db.select({ email: user.email, isBlocked: user.isBlocked }).from(user).where(eq(user.id, id)).get();
  if (!target || target.isBlocked || isRootAdmin(target.email)) return backTo('/admin/users', 'invalid');

  const form = await context.request.formData();
  const admin = form.get('admin') === '1';
  if (admin) {
    await db.update(user).set({ isAdmin: true }).where(eq(user.id, id));
  } else {
    await db.batch([db.update(user).set({ isAdmin: false }).where(eq(user.id, id)), db.delete(session).where(eq(session.userId, id))]);
  }
  notify(`👑 관리자 ${admin ? '지정' : '해제'} ${maskEmail(target.email)} (by ${maskEmail(context.locals.user?.email)})`);
  return backTo('/admin/users', admin ? 'admin_granted' : 'admin_revoked');
};
