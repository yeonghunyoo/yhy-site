import { env } from 'cloudflare:workers';
import { createMailer, type Mail, type MailResult } from '@yhy/cf-kit/mail';
import { mailBudget } from './budget';

export type { Mail, MailResult };

/**
 * Resend로 메일 1통. RESEND_API_KEY가 없으면(로컬) 콘솔에 출력하고 성공으로 친다.
 * 사이트 전체 메일 상한(Resend 무료 하루 100통 아래, docs/guides/cost-guard.md)을 넘으면 보내지 않고 `mail_budget`.
 */
export function sendMail(mail: Mail): Promise<MailResult> {
  return createMailer({
    apiKey: env.RESEND_API_KEY,
    from: `${env.SITE_NAME} <${env.MAIL_FROM}>`,
    dev: (m) => console.log(`[mail:dev] to=${m.to} reply_to=${m.replyTo ?? '-'} subject=${m.subject}\n${m.text}`),
    budget: mailBudget(),
  })(mail);
}
