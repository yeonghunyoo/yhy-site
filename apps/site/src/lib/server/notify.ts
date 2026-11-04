import { env, waitUntil } from 'cloudflare:workers';
import { sendTelegram } from '@yhy/cf-kit/notify';

export { maskEmail } from '@yhy/cf-kit/notify';

/** Telegram 알림. 응답과 분리(waitUntil)하고 실패는 무시한다. */
export function notify(text: string): void {
  waitUntil(sendTelegram({ token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID }, text).catch(() => {}));
}
