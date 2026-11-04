// Telegram 알림과 알림용 마스킹. 응답과 분리(waitUntil)하는 일은 앱이 한다 — 이 모듈은 런타임을 모른다.

/** 'abcdef@gmail.com' → 'abc***@gmail.com' (알림에 이메일 전체를 남기지 않는다) */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '(unknown)';
  const [local = '', domain] = email.split('@');
  return `${local.slice(0, 3)}***@${domain ?? ''}`;
}

export interface TelegramConfig {
  token?: string;
  chatId?: string;
}

/** Telegram 메시지 1개. 토큰이 없으면(로컬) 콘솔에 남긴다. 실패는 던진다 — 부르는 쪽이 무시할지 정한다 */
export async function sendTelegram(config: TelegramConfig, text: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!config.token || !config.chatId) {
    console.log(`[notify:dev] ${text}`);
    return;
  }
  await fetcher(`https://api.telegram.org/bot${config.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text, disable_web_page_preview: true }),
  });
}
