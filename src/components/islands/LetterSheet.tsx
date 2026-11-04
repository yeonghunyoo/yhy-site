import { useEffect, useState, type SubmitEvent } from 'react';
import type { Dict, Locale } from '../../i18n';
import { EMAIL_RE, LETTER_LIMITS, linksOk, type LetterError } from '../../lib/letters';
import { Sheet } from './Sheet';

interface Props {
  dict: Dict;
  locale: Locale;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

interface Draft {
  subject: string;
  body: string;
  replyTo: string;
}

const DRAFT_KEY = 'letterDraft';

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft | null): void {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

// 로그인 없이 보낸다(11/04, docs/03-letters.md). 답장 받을 이메일은 필수 칸.
export function LetterSheet({ dict, locale, open, onClose, onSent }: Props) {
  const [draft, setDraft] = useState<Draft>({ subject: '', body: '', replyTo: '' });
  // 허니팟 — 사람에게는 안 보이는 칸. 봇이 채우면 서버가 조용히 버린다
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 열 때 임시 저장본 복원
  useEffect(() => {
    if (!open) return;
    const saved = loadDraft();
    setDraft({ subject: saved?.subject ?? '', body: saved?.body ?? '', replyTo: saved?.replyTo ?? '' });
    setError(null);
    setBusy(false);
  }, [open]);

  const update = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      saveDraft(next);
      return next;
    });
  };

  const bodyLength = draft.body.trim().length;
  const ready = bodyLength >= LETTER_LIMITS.bodyMin && EMAIL_RE.test(draft.replyTo.trim());

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || busy) return;
    if (!linksOk(draft.body)) return setError(dict.letter.errors.links);
    setBusy(true);
    setError(null);
    const res = await fetch('/api/letters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, website, locale }),
    }).catch(() => null);
    setBusy(false);

    if (res?.ok) {
      saveDraft(null);
      // 답장 주소는 다음 레터에도 쓰도록 남긴다
      saveDraft({ subject: '', body: '', replyTo: draft.replyTo });
      setDraft({ subject: '', body: '', replyTo: draft.replyTo });
      onSent();
      return;
    }
    // 실패해도 본문은 그대로 두고 에러만 보여준다.
    const code = ((await res?.json().catch(() => null)) as { error?: LetterError } | null)?.error;
    setError(code && code in dict.letter.errors ? dict.letter.errors[code] : dict.ui.error);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={dict.letter.title}
      closeLabel={dict.ui.close}
      footer={
        <>
          <button type="submit" form="letter-form" className="btn btn-primary w-full" disabled={!ready || busy} aria-busy={busy}>
            {dict.letter.submit}
          </button>
          <p className="mt-2 text-center text-xs text-muted group-data-keyboard/sheet:hidden">
            {dict.letter.notice}{' '}
            <a href={`/${locale}/privacy/`} className="underline underline-offset-2">
              {dict.auth.privacy}
            </a>
          </p>
        </>
      }
    >
      <form id="letter-form" onSubmit={submit} className="space-y-4">
        {error && (
          <p className="rounded-[var(--radius)] border border-danger/40 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div>
          <label className="block text-sm font-semibold" htmlFor="letter-subject">
            {dict.letter.subject}
          </label>
          <input
            id="letter-subject"
            className="field mt-2"
            maxLength={LETTER_LIMITS.subjectMax}
            value={draft.subject}
            onChange={(e) => update({ subject: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="letter-body">
            {dict.letter.body}
          </label>
          <textarea
            data-scroll-allow
            id="letter-body"
            data-autofocus
            className="field mt-2 min-h-40 resize-y"
            maxLength={LETTER_LIMITS.bodyMax}
            placeholder={dict.letter.bodyPlaceholder}
            value={draft.body}
            onChange={(e) => update({ body: e.target.value })}
            aria-describedby="letter-count"
          />
          <p id="letter-count" className="mt-1 flex justify-between text-xs text-muted" aria-live="polite">
            <span>{bodyLength > 0 && bodyLength < LETTER_LIMITS.bodyMin ? dict.letter.minHint : ''}</span>
            <span>{dict.letter.counter.replace('{n}', draft.body.length.toLocaleString())}</span>
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="letter-reply">
            {dict.letter.replyTo}
          </label>
          <input
            id="letter-reply"
            className="field mt-2"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder={dict.auth.emailPlaceholder}
            value={draft.replyTo}
            onChange={(e) => update({ replyTo: e.target.value })}
          />
        </div>
        <div className="hidden" aria-hidden="true">
          <label htmlFor="letter-website">Website</label>
          <input id="letter-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </form>
    </Sheet>
  );
}
