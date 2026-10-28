import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { account, letters, user } from '../../../../../db/schema';
import { adminGuard, backTo } from '../../../../../lib/server/admin';
import { getDb } from '../../../../../lib/server/db';
import { sendMail } from '../../../../../lib/server/mail';
import { letterEmail } from '../../../../../lib/server/templates';

export const prerender = false;

/** 전달 실패(failed) 레터를 내 메일로 다시 보낸다. */
export const POST: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;

  const id = context.params.id!;
  const back = `/admin/letters/${id}`;
  const db = getDb();
  const row = await db
    .select({ letter: letters, email: user.email })
    .from(letters)
    .leftJoin(user, eq(letters.userId, user.id))
    .where(eq(letters.id, id))
    .get();
  if (!row || row.letter.status !== 'failed') return backTo(back, 'invalid');

  const { letter } = row;
  const providers = letter.userId
    ? await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, letter.userId))
    : [];
  const mail = await sendMail({
    to: env.LETTER_TO,
    replyTo: letter.replyTo ?? undefined,
    ...letterEmail({
      subject: letter.subject,
      body: letter.body,
      from: row.email ?? '(deleted account)',
      replyTo: letter.replyTo ?? '-',
      method: providers.some((p) => p.providerId === 'google') ? 'google' : 'magic',
      sentAt: letter.createdAt,
      adminUrl: `${env.BETTER_AUTH_URL}${back}`,
    }),
  });
  if (!mail.ok) return backTo(back, 'resend_failed');

  await db
    .update(letters)
    .set({ status: letter.readAt ? 'read' : 'sent', resendId: mail.id })
    .where(eq(letters.id, id));
  return backTo(back, 'resent');
};
