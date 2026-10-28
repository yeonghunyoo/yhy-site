import { useEffect, useState, type SubmitEvent } from 'react';
import type { Dict, Locale } from '../../i18n';
import { authClient } from '../../lib/auth-client';
import { Sheet } from './Sheet';

interface Props {
  dict: Dict;
  locale: Locale;
  open: boolean;
  /** 시트를 열 때 보여줄 안내(링크 만료·차단 등) */
  notice: string | null;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 로그인 후 같은 자리로 돌아와 하던 작업을 이어가도록 현재 경로를 싣는다.
const callbackURL = () => `${location.pathname}?signed_in=1${location.hash}`;
const errorCallbackURL = () => `${location.pathname}?auth_error=1`;

export function LoginSheet({ dict, locale, open, notice, onClose }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setBusy(false);
    setError(notice);
  }, [open, notice]);

  async function sendLink(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError(dict.auth.invalidEmail);
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: callbackURL(),
      errorCallbackURL: errorCallbackURL(),
    });
    setBusy(false);
    if (!error) return setSent(true);
    setError(error.status === 429 ? dict.auth.rateLimited : dict.ui.error);
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: callbackURL(),
      errorCallbackURL: errorCallbackURL(),
    });
    if (!error) return; // Google로 이동
    setBusy(false);
    setError(error.status === 404 ? dict.auth.googleUnavailable : dict.ui.error);
  }

  return (
    <Sheet open={open} onClose={onClose} title={dict.auth.title} closeLabel={dict.ui.close}>
      {sent ? (
        <div className="py-2" role="status">
          <p className="font-semibold">{dict.auth.sentTitle}</p>
          <p className="mt-2 text-muted">{dict.auth.sentBody.replace('{email}', email.trim())}</p>
          <button type="button" className="btn btn-ghost mt-6 w-full" onClick={() => setSent(false)}>
            {dict.auth.resend}
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} noValidate>
          <p className="text-muted">{dict.auth.desc}</p>
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
            data-autofocus
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
          <button type="submit" className="btn btn-primary mt-4 w-full" disabled={busy || !email.trim()}>
            {busy ? dict.ui.sending : dict.auth.sendLink}
          </button>
          <div className="my-5 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            {dict.auth.or}
            <span className="h-px flex-1 bg-border" />
          </div>
          <button type="button" className="btn btn-ghost w-full" onClick={google} disabled={busy}>
            {dict.auth.google}
          </button>
          <p className="mt-5 text-xs text-muted">
            {dict.auth.notice}{' '}
            <a href={`/${locale}/privacy/`} className="underline underline-offset-2">
              {dict.auth.privacy}
            </a>
          </p>
        </form>
      )}
    </Sheet>
  );
}
