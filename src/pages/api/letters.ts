import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { isLocale } from '../../i18n';
import { account, letters, user } from '../../db/schema';
import { getDb } from '../../lib/server/db';
import { sendMail } from '../../lib/server/mail';
import { maskEmail, notify } from '../../lib/server/notify';
import { letterEmail } from '../../lib/server/templates';
import { EMAIL_RE, LETTER_LIMITS, linksOk, type LetterError } from '../../lib/letters';

export const prerender = false;

const fail = (error: LetterError | 'unauthorized', status: number) => Response.json({ error }, { status });

export const POST: APIRoute = async ({ request, locals }) => {
  const me = locals.user;
  if (!me) return fail('unauthorized', 401);

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const subject = String(input?.subject ?? '').trim() || null;
  const body = String(input?.body ?? '').trim();
  const replyTo = String(input?.replyTo ?? '').trim() || me.email;
  const locale = isLocale(input?.locale) ? input.locale : 'ko';

  if (
    body.length < LETTER_LIMITS.bodyMin ||
    body.length > LETTER_LIMITS.bodyMax ||
    (subject?.length ?? 0) > LETTER_LIMITS.subjectMax ||
    !EMAIL_RE.test(replyTo)
  ) {
    return fail('invalid', 400);
  }
  if (!linksOk(body) || !linksOk(subject ?? '')) return fail('links', 400);

  const db = getDb();
  const profile = await db.select({ isBlocked: user.isBlocked }).from(user).where(eq(user.id, me.id)).get();
  if (!profile || profile.isBlocked) return fail('blocked', 403);

  // 하루 3통 — 최근 24시간 기준
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ sentToday }] = await db
    .select({ sentToday: count() })
    .from(letters)
    .where(and(eq(letters.userId, me.id), gte(letters.createdAt, since)));
  if (sentToday >= LETTER_LIMITS.perDay) return fail('limit', 429);

  const last = await db
    .select({ body: letters.body })
    .from(letters)
    .where(eq(letters.userId, me.id))
    .orderBy(desc(letters.createdAt))
    .limit(1)
    .get();
  if (last?.body === body) return fail('duplicate', 409);

  const id = crypto.randomUUID();
  const createdAt = new Date();
  await db.insert(letters).values({ id, userId: me.id, subject, body, replyTo, locale, status: 'sent', createdAt });

  const providers = await db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, me.id));
  const method = providers.some((p) => p.providerId === 'google') ? 'google' : 'magic';
  const adminUrl = `${env.BETTER_AUTH_URL}/admin/letters/${id}`;

  const mail = await sendMail({
    to: env.LETTER_TO,
    replyTo,
    ...letterEmail({ subject, body, from: me.email, replyTo, method, sentAt: createdAt, adminUrl }),
  });

  if (mail.ok) {
    await db.update(letters).set({ resendId: mail.id }).where(eq(letters.id, id));
    notify(`📮 새 레터\n${maskEmail(me.email)}\n${subject ?? '(제목 없음)'}\n${body.slice(0, 80)}\n${adminUrl}`);
  } else {
    // 방문자에게는 성공으로 보인다 — 레터는 저장됐고 어드민에서 재전송한다.
    await db.update(letters).set({ status: 'failed' }).where(eq(letters.id, id));
    notify(`⚠️ Resend 실패\nletter ${id}\n${mail.error.slice(0, 120)}`);
  }

  return Response.json({ ok: true });
};
