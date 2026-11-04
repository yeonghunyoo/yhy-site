/**
 * 메일 발송. 운영은 Resend(HTTP API, @yhy/cf-kit/mail), 로컬은 메모리 보관함(outbox) + 콘솔 출력.
 * 실제로 Resend로 보낼 때만 서비스 전체 상한(worker/lib/usage.ts)을 거친다 — 로컬 보관함은 세지 않는다.
 */
import { createMailer, type Mail, type MailBudget, type MailResult } from "@yhy/cf-kit/mail";

export type { Mail, MailResult };

/** 로컬 개발 전용 보관함: 테스트가 인증·재설정 링크를 읽어 간다 (GET /api/dev/outbox) */
const outbox: (Mail & { at: number })[] = [];

export function devOutbox(to?: string) {
  return to ? outbox.filter((m) => m.to === to.toLowerCase()) : outbox.slice(-20);
}

export const mailEnabled = (env: Env) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

export function sendMail(env: Env, mail: Mail, budget?: MailBudget): Promise<MailResult> {
  const enabled = mailEnabled(env);
  return createMailer({
    apiKey: enabled ? env.RESEND_API_KEY : undefined,
    from: env.EMAIL_FROM,
    // 운영에서 키가 없으면 보내지 않고 실패(mail_not_configured)
    dev:
      env.ENVIRONMENT === "production"
        ? undefined
        : (m) => {
            outbox.push({ ...m, to: m.to.toLowerCase(), at: Date.now() });
            if (outbox.length > 200) outbox.shift();
            console.log(`[mail:dev] to=${m.to} subject=${m.subject}\n${m.text}`);
          },
    budget: enabled ? budget : undefined,
  })(mail);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 단순한 한 단 메일. 색은 디자인 토큰(웜톤 무채색 + 클레이)을 hex로 옮긴 값 */
function layout(title: string, body: string, cta: { label: string; url: string }, note: string) {
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f8f5f1;font-family:-apple-system,'Pretendard',sans-serif;color:#3a3530">
<div style="max-width:440px;margin:0 auto;padding:40px 24px">
<p style="font-size:18px;font-weight:300;letter-spacing:.25em;margin:0 0 32px">nuvo</p>
<h1 style="font-size:20px;font-weight:400;margin:0 0 12px">${esc(title)}</h1>
<p style="font-size:14px;line-height:1.6;color:#6b645d;margin:0 0 28px">${esc(body)}</p>
<a href="${esc(cta.url)}" style="display:inline-block;background:#a0573a;color:#fbf8f4;text-decoration:none;font-size:14px;padding:12px 22px;border-radius:999px">${esc(cta.label)}</a>
<p style="font-size:12px;line-height:1.6;color:#857d75;margin:32px 0 0">${esc(note)}</p>
</div></body></html>`;
  const text = `${title}\n\n${body}\n\n${cta.label}: ${cta.url}\n\n${note}`;
  return { html, text };
}

export function verifyEmailMail(name: string, url: string): Omit<Mail, "to"> {
  return {
    subject: "nuvo 이메일 인증",
    ...layout(
      `${name}님, 이메일을 인증해 주세요`,
      "아래 버튼을 누르면 가입이 끝나고 바로 로그인돼요.",
      { label: "이메일 인증하기", url },
      "링크는 1시간 동안 유효해요. 가입한 적이 없다면 이 메일을 무시하세요.",
    ),
  };
}

export function resetPasswordMail(name: string, url: string): Omit<Mail, "to"> {
  return {
    subject: "nuvo 비밀번호 재설정",
    ...layout(
      "비밀번호를 다시 설정해 주세요",
      `${name}님의 nuvo 계정 비밀번호 재설정을 요청받았어요.`,
      { label: "새 비밀번호 만들기", url },
      "링크는 1시간 동안 유효해요. 요청한 적이 없다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않아요.",
    ),
  };
}
