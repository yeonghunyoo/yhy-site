import { env } from 'cloudflare:workers';
import type { Locale } from '../../i18n';

// 메일 템플릿 — 플레인 텍스트에 가까운 단순 HTML. 로고 없음, 본문 몇 문장 + 버튼 1개 + 원문 링크.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 줄바꿈만 살리고 링크는 자동 연결하지 않는다(피싱 방지). */
function paragraphs(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

function layout(body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;color:#18181b;background:#ffffff"><div style="max-width:560px">${body}</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#18181b;color:#fafafa;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>`;
}

const prefix = () => `[${env.SITE_NAME}]`;

export function magicLinkEmail(locale: Locale, url: string) {
  const ko = locale === 'ko';
  const subject = ko ? `${prefix()} 로그인 링크` : `${prefix()} Your sign-in link`;
  const lines = ko
    ? ['아래 버튼을 누르면 로그인돼요.', '링크는 15분 동안 한 번만 쓸 수 있어요.', '요청한 적이 없다면 이 메일은 무시해도 괜찮아요.']
    : ['Tap the button below to sign in.', 'The link works once and expires in 15 minutes.', "If you didn't ask for this, you can ignore this email."];
  const label = ko ? '로그인' : 'Sign in';
  const fallback = ko ? '버튼이 안 되면 이 주소를 브라우저에 붙여넣으세요:' : "If the button doesn't work, paste this into your browser:";
  return {
    subject,
    text: `${lines.join('\n')}\n\n${url}`,
    html: layout(
      `<p>${lines.map(escapeHtml).join('<br>')}</p>${button(url, label)}<p style="color:#52525b;font-size:14px">${escapeHtml(fallback)}<br>${escapeHtml(url)}</p>`,
    ),
  };
}

export function letterEmail(input: {
  subject: string | null;
  body: string;
  from: string;
  replyTo: string;
  method: string;
  sentAt: Date;
  adminUrl: string;
}) {
  const title = input.subject?.trim() || input.body.trim().slice(0, 40);
  const meta = [
    `From: ${input.from}`,
    `Reply-To: ${input.replyTo}`,
    `Sign-in: ${input.method}`,
    `Sent: ${input.sentAt.toISOString()}`,
  ];
  return {
    subject: `[Letter] ${title}`,
    text: `${input.body}\n\n---\n${meta.join('\n')}\nAdmin: ${input.adminUrl}`,
    html: layout(
      `<p>${paragraphs(input.body)}</p><hr style="border:0;border-top:1px solid #e4e4e7;margin:24px 0"><p style="color:#52525b;font-size:14px">${meta.map(escapeHtml).join('<br>')}</p>${button(input.adminUrl, 'Admin')}`,
    ),
  };
}

export function replyEmail(locale: Locale, input: { original: string; reply: string }) {
  const ko = locale === 'ko';
  const subject = ko ? `${prefix()} 답장이 도착했어요` : `${prefix()} You've got a reply`;
  const quoteLabel = ko ? '보내신 레터' : 'Your letter';
  const footer = ko ? '이 메일에 답장하면 저에게 바로 전달돼요.' : 'Reply to this email and it comes straight to me.';
  const quoted = input.original
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  return {
    subject,
    text: `${input.reply}\n\n${quoteLabel}:\n${quoted}\n\n${footer}`,
    html: layout(
      `<p>${paragraphs(input.reply)}</p><p style="color:#52525b;font-size:14px;margin-top:24px">${escapeHtml(quoteLabel)}</p><blockquote style="margin:0;padding-left:12px;border-left:3px solid #e4e4e7;color:#52525b">${paragraphs(input.original)}</blockquote><p style="color:#52525b;font-size:14px;margin-top:24px">${escapeHtml(footer)}</p>`,
    ),
  };
}
