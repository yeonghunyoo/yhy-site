import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { Dict, Locale } from '../../i18n';

interface Props {
  dict: Dict;
  locale: Locale;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  /** 한도 초과 등 안내(서버로 보내는 대화 기록에는 넣지 않는다) */
  notice?: 'login' | 'letter' | 'error';
}

const HISTORY_KEY = 'chatHistory';
const MAX_QUESTION = 500;

function load(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]') as Turn[];
  } catch {
    return [];
  }
}

/** 답변 표시용: [[slug]] 표기(스트리밍 중 반쯤 온 것 포함)를 지운다. */
const visible = (text: string) => text.replace(/\[\[[^\]]*\]\]?|\[\[?$/g, '').trim();

/** 우하단 챗 독. 모바일은 풀스크린, 데스크톱은 380px 패널. 대화는 sessionStorage에만. */
export default function ChatDock({ dict, locale }: Props) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewportH, setViewportH] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTurns(load());
    // 하이드레이트를 일으킨 독 버튼 클릭(client:demand)
    if (window.__uiPending === 'chat') {
      window.__uiPending = undefined;
      setOpen(true);
    }
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('[data-action="chat"]')) setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(turns.slice(-20)));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  // 키보드가 올라와도 입력창이 보이도록 보이는 높이에 맞춘다(모바일 풀스크린).
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    const vv = window.visualViewport;
    const onResize = () => vv && setViewportH(vv.height);
    onResize();
    vv?.addEventListener('resize', onResize);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      vv?.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function ask(question: string) {
    const q = question.trim().slice(0, MAX_QUESTION);
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    const history = turns.filter((t) => !t.notice).map(({ role, content }) => ({ role, content }));
    setTurns((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: '' }]);

    const patchLast = (patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) };
        return next;
      });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history, locale }),
      });
      if (res.status === 429) {
        const { signedIn } = (await res.json()) as { signedIn?: boolean };
        patchLast({
          content: signedIn ? dict.chat.limitSignedIn : dict.chat.limitAnon,
          notice: signedIn ? 'letter' : 'login',
        });
        return;
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const raw of events) {
          const line = raw.replace(/^data: /, '');
          if (!line) continue;
          const event = JSON.parse(line) as { t: 'delta' | 'done' | 'error'; text?: string; sources?: string[] };
          if (event.t === 'delta') patchLast((t) => ({ content: t.content + (event.text ?? '') }));
          if (event.t === 'done') patchLast({ sources: event.sources ?? [] });
          if (event.t === 'error') throw new Error('stream error');
        }
      }
    } catch {
      patchLast({ content: dict.chat.error, notice: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    void ask(input);
  }

  const sourceLink = (slug: string) =>
    slug.startsWith('projects/')
      ? { href: `/${locale}/${slug}/`, label: `${dict.chat.sources.project} · ${slug.slice('projects/'.length)}` }
      : slug === 'about'
        ? { href: `/${locale}/#intro`, label: dict.chat.sources.about }
        : { href: `/${locale}/#project`, label: dict.chat.sources.stack };

  if (!open) {
    return (
      <button
        type="button"
        data-action="chat"
        aria-label={dict.chat.open}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-accent text-accent-fg shadow-lg"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={dict.chat.title}
      className="fixed inset-x-0 top-0 z-40 flex flex-col bg-surface md:inset-auto md:right-4 md:bottom-4 md:h-[560px] md:max-h-[calc(100dvh-2rem)] md:w-[380px] md:rounded-[var(--radius)] md:border md:border-border md:shadow-2xl"
      style={{ height: viewportH && window.innerWidth < 768 ? viewportH : undefined }}
    >
      <header className="flex items-center justify-between border-b border-border pt-[env(safe-area-inset-top)] pr-2 pl-4">
        <h2 className="font-bold">{dict.chat.title}</h2>
        <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center text-xl" aria-label={dict.ui.close}>
          ×
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        <p className="rounded-[var(--radius)] bg-bg px-3 py-2">{dict.chat.greeting}</p>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {dict.chat.chips.map((chip) => (
              <button key={chip} type="button" className="btn min-h-11 text-sm font-normal" onClick={() => void ask(chip)}>
                {chip}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <p key={i} className="ml-8 rounded-[var(--radius)] bg-accent px-3 py-2 break-words text-accent-fg">
              {t.content}
            </p>
          ) : (
            <div key={i} className="mr-8">
              <p className={`rounded-[var(--radius)] bg-bg px-3 py-2 break-words whitespace-pre-wrap ${t.notice === 'error' ? 'text-danger' : ''}`}>
                {visible(t.content) || (busy && i === turns.length - 1 ? '…' : '')}
              </p>
              {(t.sources?.length || t.notice === 'login' || t.notice === 'letter' || t.content.includes('[[letter]]')) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.sources?.map((slug) => {
                    const link = sourceLink(slug);
                    return (
                      <a key={slug} href={link.href} className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm">
                        {link.label}
                      </a>
                    );
                  })}
                  {t.notice === 'login' && (
                    <button type="button" data-action="login" className="btn min-h-11 text-sm">
                      {dict.chat.login}
                    </button>
                  )}
                  {(t.notice === 'letter' || t.content.includes('[[letter]]')) && (
                    <button type="button" data-action="letter" className="btn min-h-11 text-sm">
                      {dict.chat.letter}
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form onSubmit={submit} className="border-t border-border px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="field max-h-32 flex-1 resize-none"
            placeholder={dict.chat.placeholder}
            maxLength={MAX_QUESTION}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(input);
              }
            }}
            aria-label={dict.chat.placeholder}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
            {dict.chat.send}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">{dict.chat.notice}</p>
      </form>
    </section>
  );
}
