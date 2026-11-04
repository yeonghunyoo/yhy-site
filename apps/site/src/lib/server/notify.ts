import { env, waitUntil } from 'cloudflare:workers';

/** 'abcdef@gmail.com' → 'abc***@gmail.com' (Telegram에 이메일 전체를 남기지 않는다) */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(unknown)';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 3)}***@${domain ?? ''}`;
}

async function send(text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log(`[notify:dev] ${text}`);
    return;
  }
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
}

/** Telegram 알림. 응답과 분리(waitUntil)하고 실패는 무시한다. */
export function notify(text: string): void {
  waitUntil(send(text).catch(() => {}));
}
