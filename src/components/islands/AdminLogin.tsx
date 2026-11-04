import { useEffect, useState, type SubmitEvent } from 'react';
import type { Dict } from '../../i18n';
import { authClient } from '../../lib/auth-client';

interface Props {
  dict: Dict;
  /** 처음 보여줄 안내(링크 만료·차단 등) */
  notice: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 앱 안 브라우저(카카오톡·인스타그램·페이스북·라인·네이버, Android WebView)에서는 Google이 OAuth를 막는다(403 disallowed_useragent).
// 버튼을 끄고 이메일 링크나 외부 브라우저를 안내한다(docs/guides/browser-support.md).
const IN_APP_BROWSER = /KAKAOTALK|Instagram|FBAN|FBAV|FB_IAB|\bLine\/|NAVER\(inapp|DaumApps|; wv\)/i;

// 관리자 로그인 화면(/admin, 11/04 — 방문자 화면에는 로그인이 없다). 로그인하면 /admin으로 돌아온다.
const callbackURL = () => '/admin';
const errorCallbackURL = () => '/admin?auth_error=1';

export default function AdminLogin({ dict, notice }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  // 진행 중인 동작(버튼마다 스피너). null이면 대기
  const [busy, setBusy] = useState<'link' | 'google' | 'code' | null>(null);
  // 메일의 6자리 인증 코드 — 링크가 인앱 브라우저·다른 기기에서 열려도 여기서 로그인(docs/02-auth.md)
  const [code, setCode] = useState('');
  // 만료·3회 초과면 코드 입력 대신 다시 보내기를 권한다
  const [codeDead, setCodeDead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);

  // Google로 갔다가 뒤로 가기로 돌아오면(bfcache, 특히 Safari) 스피너가 남는다 — 되돌린다
  useEffect(() => {
    setInApp(IN_APP_BROWSER.test(navigator.userAgent));
    const onShow = (e: PageTransitionEvent) => e.persisted && setBusy(null);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  useEffect(() => setError(notice), [notice]);

  async function sendLink(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError(dict.auth.invalidEmail);
    setBusy('link');
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: callbackURL(),
      errorCallbackURL: errorCallbackURL(),
    });
    setBusy(null);
    if (!error) {
      setCode('');
      setCodeDead(false);
      return setSent(true);
    }
    setError(error.status === 429 ? dict.auth.rateLimited : dict.ui.error);
  }

  async function verifyCode(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const otp = code.replace(/\D/g, '');
    if (otp.length !== 6) return setError(dict.auth.codeInvalid);
    setBusy('code');
    setError(null);
    const { error } = await authClient.$fetch('/sign-in/email-otp', { method: 'POST', body: { email: email.trim(), otp } });
    if (!error) {
      // 세션 쿠키가 생겼다 — 어드민으로
      location.assign(callbackURL());
      return;
    }
    setBusy(null);
    const reason = (error as { code?: string }).code;
    if (error.status === 429) return setError(dict.auth.rateLimited);
    if (reason === 'OTP_EXPIRED' || reason === 'TOO_MANY_ATTEMPTS') {
      setCodeDead(true);
      return setError(reason === 'OTP_EXPIRED' ? dict.auth.codeExpired : dict.auth.codeTooMany);
    }
    if (reason === 'INVALID_OTP') return setError(dict.auth.codeWrong);
    setError(reason === 'FAILED_TO_CREATE_SESSION' ? dict.auth.blocked : dict.ui.error);
  }

  async function google() {
    setBusy('google');
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: callbackURL(),
      errorCallbackURL: errorCallbackURL(),
    });
    if (!error) return; // Google로 이동(이동할 때까지 스피너 유지)
    setBusy(null);
    setError(error.status === 404 ? dict.auth.googleUnavailable : dict.ui.error);
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-bold">{dict.auth.title}</h1>
      {sent ? (
        <div className="py-2">
          <div role="status">
            <p className="font-semibold">{dict.auth.sentTitle}</p>
            <p className="mt-2 text-muted">{dict.auth.sentBody.replace('{email}', email.trim())}</p>
          </div>
          <form className="mt-5" onSubmit={verifyCode} noValidate>
            <label className="block text-sm font-semibold" htmlFor="login-code">
              {dict.auth.codeLabel}
            </label>
            <p className="mt-1 text-sm text-muted">{dict.auth.codeHint}</p>
            {error && (
              <p className="mt-3 rounded-[var(--radius)] border border-danger/40 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            {!codeDead && (
              <>
                <input
                  id="login-code"
                  className="field mt-3 text-center font-mono text-2xl tracking-[0.4em]"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy !== null || code.length !== 6} aria-busy={busy === 'code'}>
                  {dict.auth.codeSubmit}
                </button>
              </>
            )}
          </form>
          <button type="button" className="btn mt-3 w-full" onClick={() => { setSent(false); setError(null); }} disabled={busy !== null}>
            {codeDead ? dict.auth.sendAgain : dict.auth.resend}
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} noValidate>
          <p className="mt-2 text-muted">{dict.auth.desc}</p>
          {error && (
            <p className="mt-4 rounded-[var(--radius)] border border-danger/40 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <label className="mt-5 block text-sm font-semibold" htmlFor="login-email">
            {dict.auth.email}
          </label>
          <input
            id="login-email"
            autoFocus
            className="field mt-2"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={dict.auth.emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy !== null || !email.trim()} aria-busy={busy === 'link'}>
            {dict.auth.sendLink}
          </button>
          <div className="my-5 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            {dict.auth.or}
            <span className="h-px flex-1 bg-border" />
          </div>
          <button type="button" className="btn w-full" onClick={google} disabled={busy !== null || inApp} aria-busy={busy === 'google'}>
            {dict.auth.google}
          </button>
          {inApp && <p className="mt-2 text-sm text-muted">{dict.auth.googleInApp}</p>}
        </form>
      )}
    </div>
  );
}
