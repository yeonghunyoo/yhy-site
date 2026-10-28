import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { letterReplies, letters } from '../../../../../db/schema';
import { adminGuard, backTo } from '../../../../../lib/server/admin';
import { getDb } from '../../../../../lib/server/db';
import { sendMail } from '../../../../../lib/server/mail';
import { notify } from '../../../../../lib/server/notify';
import { replyEmail } from '../../../../../lib/server/templates';

export const prerender = false;

/** 사이트 안에서 답장 1회 — 방문자에게 메일로 보내고, 방문자가 메일에 답하면 내 개인 메일로 온다. */
export const POST: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;

  const id = context.params.id!;
  const back = `/admin/letters/${id}`;
  const form = await context.request.formData();
  const body = String(form.get('body') ?? '').trim();
  if (!body || body.length > 2000) return backTo(back, 'invalid');

  const db = getDb();
  const letter = await db.select().from(letters).where(eq(letters.id, id)).get();
  if (!letter?.replyTo) return backTo(back, 'invalid');

  const mail = await sendMail({
    to: letter.replyTo,
    replyTo: env.LETTER_TO,
    ...replyEmail(letter.locale, { original: letter.body, reply: body }),
  });

  await db.insert(letterReplies).values({
    id: crypto.randomUUID(),
    letterId: id,
    body,
    resendId: mail.ok ? mail.id : null,
    status: mail.ok ? 'sent' : 'failed',
  });

  if (!mail.ok) {
    notify(`⚠️ Resend 실패\nreply to letter ${id}\n${mail.error.slice(0, 120)}`);
    return backTo(back, 'reply_failed');
  }
  await db.update(letters).set({ status: 'replied' }).where(eq(letters.id, id));
  return backTo(back, 'replied');
};
