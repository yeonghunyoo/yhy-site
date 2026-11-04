import { env } from 'cloudflare:workers';
import { mailAllowed, recordMail } from './budget';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export type MailResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Resend로 메일 1통. RESEND_API_KEY가 없으면(로컬) 콘솔에 출력하고 성공으로 친다.
 * 사이트 전체 메일 상한(Resend 무료 하루 100통 아래, docs/guides/cost-guard.md)을 넘으면 보내지 않고 `mail_budget`.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!(await mailAllowed())) return { ok: false, error: 'mail_budget' };
  if (!env.RESEND_API_KEY) {
    console.log(`[mail:dev] to=${mail.to} reply_to=${mail.replyTo ?? '-'} subject=${mail.subject}\n${mail.text}`);
    await recordMail();
    return { ok: true, id: `dev-${crypto.randomUUID()}` };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${env.SITE_NAME} <${env.MAIL_FROM}>`,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        reply_to: mail.replyTo,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) return { ok: false, error: data.message ?? `HTTP ${res.status}` };
    await recordMail();
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
