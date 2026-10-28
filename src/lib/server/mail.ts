import { env } from 'cloudflare:workers';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export type MailResult = { ok: true; id: string } | { ok: false; error: string };

/** Resend로 메일 1통. RESEND_API_KEY가 없으면(로컬) 콘솔에 출력하고 성공으로 친다. */
export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!env.RESEND_API_KEY) {
    console.log(`[mail:dev] to=${mail.to} reply_to=${mail.replyTo ?? '-'} subject=${mail.subject}\n${mail.text}`);
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
    return { ok: true, id: data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
