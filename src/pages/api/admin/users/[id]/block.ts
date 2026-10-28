import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { session, user } from '../../../../../db/schema';
import { adminGuard, backTo } from '../../../../../lib/server/admin';
import { getDb } from '../../../../../lib/server/db';

export const prerender = false;

/** 차단 토글. 차단하면 세션을 전부 지워 즉시 로그아웃시킨다(차단 중엔 레터 불가, 새 로그인 불가). */
export const POST: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;

  const id = context.params.id!;
  if (id === context.locals.user?.id) return backTo('/admin/users', 'invalid');

  const form = await context.request.formData();
  const blocked = form.get('blocked') === '1';
  const db = getDb();
  if (blocked) {
    await db.batch([
      db.update(user).set({ isBlocked: true }).where(eq(user.id, id)),
      db.delete(session).where(eq(session.userId, id)),
    ]);
  } else {
    await db.update(user).set({ isBlocked: false }).where(eq(user.id, id));
  }
  return backTo('/admin/users', blocked ? 'blocked' : 'unblocked');
};
