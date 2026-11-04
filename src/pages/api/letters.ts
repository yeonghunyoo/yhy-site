import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { desc, eq } from 'drizzle-orm';
import { isLocale } from '../../i18n';
import { letters } from '../../db/schema';
import { hashIp } from '../../lib/server/chat';
import { clientIp, hit } from '../../lib/server/ratelimit';
import { getDb } from '../../lib/server/db';
import { sendMail } from '../../lib/server/mail';
import { maskEmail, notify } from '../../lib/server/notify';
import { killed, lettersAllowed } from '../../lib/server/budget';
import { letterEmail } from '../../lib/server/templates';
import { EMAIL_RE, LETTER_LIMITS, linksOk, type LetterError } from '../../lib/letters';

export const prerender = false;

const fail = (error: LetterError, status: number) => Response.json({ error }, { status });

export const POST: APIRoute = async ({ request }) => {
  // 긴급 스위치(KILL_LETTERS=1) — docs/guides/cost-guard.md
  if (killed('KILL_LETTERS')) return Response.json({ error: 'unavailable' }, { status: 503 });

  // 로그인 없이 받는다(11/04, docs/03-letters.md). 답장 이메일은 방문자가 직접 적는 필수 칸.
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  // 허니팟: 화면에 안 보이는 칸. 채워져 있으면 봇 — 저장·발송 없이 성공처럼 응답한다
  if (String(input?.website ?? '').trim()) return Response.json({ ok: true });
  const subject = String(input?.subject ?? '').trim() || null;
  const body = String(input?.body ?? '').trim();
  const replyTo = String(input?.replyTo ?? '').trim();
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
  // 같은 답장 주소의 직전 레터와 본문이 같으면 거부(두 번 누름·복붙 반복)
  const last = await db
    .select({ body: letters.body })
    .from(letters)
    .where(eq(letters.replyTo, replyTo))
    .orderBy(desc(letters.createdAt))
    .limit(1)
    .get();
  if (last?.body === body) return fail('duplicate', 409);

  // 사이트 전체 하루 상한, 그다음 IP당 하루 3통(KV, 24시간)
  if (!(await lettersAllowed())) return fail('limit', 429);
  const ipHash = await hashIp(clientIp(request), env.BETTER_AUTH_SECRET);
  if (!(await hit(`letter:ip:${ipHash}`, LETTER_LIMITS.perDay, 24 * 60 * 60))) return fail('limit', 429);

  const id = crypto.randomUUID();
  const createdAt = new Date();
  await db.insert(letters).values({ id, userId: null, subject, body, replyTo, locale, status: 'sent', createdAt });

  const adminUrl = `${env.BETTER_AUTH_URL}/admin/letters/${id}`;
  const mail = await sendMail({
    to: env.LETTER_TO,
    replyTo,
    ...letterEmail({ subject, body, replyTo, sentAt: createdAt, adminUrl }),
  });

  if (mail.ok) {
    await db.update(letters).set({ resendId: mail.id }).where(eq(letters.id, id));
    notify(`📮 새 레터\n${maskEmail(replyTo)}\n${subject ?? '(제목 없음)'}\n${body.slice(0, 80)}\n${adminUrl}`);
  } else {
    // 방문자에게는 성공으로 보인다 — 레터는 저장됐고 어드민에서 재전송한다.
    await db.update(letters).set({ status: 'failed' }).where(eq(letters.id, id));
    notify(`⚠️ Resend 실패\nletter ${id}\n${mail.error.slice(0, 120)}`);
  }

  return Response.json({ ok: true });
};
