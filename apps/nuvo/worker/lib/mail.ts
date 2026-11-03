/**
 * 메일 발송. 운영은 Resend(HTTP API), 로컬은 메모리 보관함(outbox) + 콘솔 출력.
 * 인터페이스는 portfolio-web의 sendMail과 같게 맞춰 두었다 (나중에 공용 패키지로 뺄 수 있게).
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailResult = { ok: true; id: string } | { ok: false; error: string };

/** 로컬 개발 전용 보관함: 테스트가 인증·재설정 링크를 읽어 간다 (GET /api/dev/outbox) */
const outbox: (Mail & { at: number })[] = [];

export function devOutbox(to?: string) {
  return to ? outbox.filter((m) => m.to === to.toLowerCase()) : outbox.slice(-20);
}

export const mailEnabled = (env: Env) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);

export async function sendMail(env: Env, mail: Mail): Promise<MailResult> {
  if (!mailEnabled(env)) {
    if (env.ENVIRONMENT === "production") return { ok: false, error: "메일 발송이 설정되지 않았어요" };
    outbox.push({ ...mail, to: mail.to.toLowerCase(), at: Date.now() });
    if (outbox.length > 200) outbox.shift();
    console.log(`[mail:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return { ok: true, id: `dev-${crypto.randomUUID()}` };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !data.id) return { ok: false, error: data.message ?? `HTTP ${res.status}` };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
