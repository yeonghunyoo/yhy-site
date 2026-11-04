// Resend 메일 발송 — site·nuvo 공용. 키가 없을 때(로컬)의 처리와 예산 상한은 앱이 넘긴다.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export type MailResult = { ok: true; id: string } | { ok: false; error: string };

/** 보내기 전 확인·보낸 뒤 기록. budget.ts의 createCountBudget이 이 모양이다 */
export interface MailBudget {
  allowed(): Promise<boolean>;
  record(): Promise<void>;
}

export interface MailerOptions {
  /** Resend API 키. 없으면 dev로 보낸다 */
  apiKey?: string;
  /** 보내는 주소. 예: 'nuvo <noreply@mail.example.com>' */
  from: string;
  /** 키가 없을 때 대신 할 일(콘솔·로컬 보관함). 없으면 'mail_not_configured'로 실패한다(운영) */
  dev?: (mail: Mail) => void;
  /** 넘으면 보내지 않고 'mail_budget' */
  budget?: MailBudget;
  fetcher?: typeof fetch;
}

export function createMailer(o: MailerOptions): (mail: Mail) => Promise<MailResult> {
  const fetcher = o.fetcher ?? fetch;
  return async (mail) => {
    if (o.budget && !(await o.budget.allowed())) return { ok: false, error: 'mail_budget' };
    if (!o.apiKey) {
      if (!o.dev) return { ok: false, error: 'mail_not_configured' };
      o.dev(mail);
      await o.budget?.record();
      return { ok: true, id: `dev-${crypto.randomUUID()}` };
    }
    try {
      const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: o.from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          reply_to: mail.replyTo,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok || !data.id) return { ok: false, error: data.message ?? `HTTP ${res.status}` };
      await o.budget?.record();
      return { ok: true, id: data.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
}
