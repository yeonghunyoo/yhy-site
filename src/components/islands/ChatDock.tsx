import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { Dict, Locale } from '../../i18n';
import { visibleAnswer } from './chat-text';
import { lockScroll } from './scroll-lock';
import { watchViewport } from './viewport';

interface Props {
  dict: Dict;
  locale: Locale;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  /** 서버가 답변에 붙인 서명 — 다음 요청 때 이력과 함께 돌려보낸다(서명 없는 답변은 이력에서 빠진다) */
  sig?: string;
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

/** 우하단 챗 독. 모바일은 풀스크린, 데스크톱은 380px 패널. 대화는 sessionStorage에만. */
export default function ChatDock({ dict, locale }: Props) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // 모바일 풀스크린일 때 보이는 영역(visualViewport)에 맞춘 높이·위치. 데스크톱 패널이면 null
  // 모바일 풀스크린이면 { keyboard }. 높이·위치는 프레임마다 DOM에 바로 쓴다(viewport.ts) — 상태로 받으면 늦게 그려져 창이 출렁인다
  const [frame, setFrame] = useState<{ keyboard: boolean } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
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

  // 모바일 풀스크린: 키보드가 올라와도 입력창이 키보드 바로 위에 붙고, 그 아래로 아무것도 보이지 않게 한다.
  // iOS Safari는 키보드가 떠도 레이아웃 뷰포트를 줄이지 않고 화면을 위로 밀어 올린다 — 그래서 패널을
  // visualViewport의 높이와 위치(offsetTop)에 맞춘다. 뒤 페이지는 고정해 스크롤되지 않게 한다.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    // Esc는 맨 위 레이어만 닫는다 — 챗 위에 시트(로그인 등, aria-modal)가 떠 있으면 시트가 닫는다
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && setOpen(false);
    document.addEventListener('keydown', onKey);
    if (window.innerWidth >= 768) {
      setFrame(null);
      return () => document.removeEventListener('keydown', onKey);
    }

    const stop = watchViewport(({ height, top, keyboard }) => {
      const panel = panelRef.current;
      const list = listRef.current;
      // 목록이 맨 아래였으면 높이가 바뀐 뒤에도 맨 아래(최근 답)를 보여 준다
      const atBottom = list ? list.scrollTop + list.clientHeight >= list.scrollHeight - 8 : false;
      if (panel) {
        panel.style.height = `${height}px`;
        panel.style.transform = `translate3d(0, ${top}px, 0)`;
      }
      if (list && atBottom) list.scrollTop = list.scrollHeight;
      setFrame((prev) => (prev?.keyboard === keyboard ? prev : { keyboard }));
    });

    // 배경 스크롤 잠금(iOS는 overflow:hidden만으로는 밀린다 — scroll-lock.ts). 위에 로그인 시트가 겹쳐 열려도 횟수로 센다.
    const unlock = lockScroll();

    return () => {
      stop();
      document.removeEventListener('keydown', onKey);
      unlock();
      const panel = panelRef.current;
      if (panel) {
        panel.style.height = '';
        panel.style.transform = '';
      }
      setFrame(null);
    };
  }, [open]);

  async function ask(question: string) {
    const q = question.trim().slice(0, MAX_QUESTION);
    if (!q || busy) return;
    setBusy(true);
    setInput('');
    const history = turns.filter((t) => !t.notice).map(({ role, content, sig }) => ({ role, content, sig }));
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
          const event = JSON.parse(line) as { t: 'delta' | 'done' | 'error'; text?: string; sources?: string[]; sig?: string };
          if (event.t === 'delta') patchLast((t) => ({ content: t.content + (event.text ?? '') }));
          if (event.t === 'done') patchLast({ sources: event.sources ?? [], sig: event.sig });
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

  // 이 사이트에 이동할 자리가 있는 문서만 칩(링크)으로 만든다. 이력서·handoff-agent·Forest·FAQ는
  // 사이트에 해당 화면이 없어 링크 대신 출처 이름만 글자로 보여준다(누를 수 없는 것이 칩처럼 보이지 않게).
  const sourceLink = (slug: string) =>
    slug.startsWith('projects/')
      ? { href: `/${locale}/${slug}/`, label: `${dict.chat.sources.project} · ${slug.slice('projects/'.length)}` }
      : slug === 'about'
        ? { href: `/${locale}/#intro`, label: dict.chat.sources.about }
        : slug === 'stack'
          ? { href: `/${locale}/#project`, label: dict.chat.sources.stack }
          : null;
  const sourceName = (slug: string) =>
    ({ resume: dict.chat.sources.resume, 'handoff-agent': 'handoff-agent', forest: 'Forest', faq: dict.chat.sources.faq })[slug] ?? slug;
  // 같은 페이지 안 링크(#intro 등)는 패널을 닫아야 이동한 자리가 보인다(모바일은 패널이 화면 전체).
  const followSource = (href: string) => {
    if (href.split('#')[0] === location.pathname) setOpen(false);
  };

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
    <>
    {/* 모바일: 뒤 페이지를 화면 아래(키보드 뒤)까지 같은 배경으로 덮는다 — 보이지도, 눌리지도 않게. 화면 높이의 2배로 늘려
        iOS가 보이는 영역을 밀어도 페이지가 드러나지 않는다 */}
    {frame && <div className="fixed inset-x-0 top-0 z-40 h-[200lvh] bg-surface md:hidden" aria-hidden="true" />}
    <section
      ref={panelRef}
      role="dialog"
      aria-label={dict.chat.title}
      className="fixed inset-x-0 top-0 bottom-0 z-40 flex flex-col bg-surface md:inset-auto md:right-4 md:bottom-4 md:h-[560px] md:max-h-[calc(100dvh-2rem)] md:w-[380px] md:rounded-[var(--radius)] md:border md:border-border md:shadow-2xl"
    >
      <header className={`flex shrink-0 items-center justify-between border-b border-border pr-2 pl-4 ${frame?.keyboard ? '' : 'pt-[env(safe-area-inset-top)]'}`}>
        <h2 className="font-bold">{dict.chat.title}</h2>
        <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center text-xl" aria-label={dict.ui.close}>
          ×
        </button>
      </header>

      <div ref={listRef} data-scroll-allow className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        <p className="rounded-[var(--radius)] bg-bg px-3 py-2">{dict.chat.greeting}</p>
        {/* 개인정보 고지 — 입력란 아래에서 옮겼다(11/03, 입력 영역을 좁게) */}
        <p className="px-1 text-xs text-muted">{dict.chat.notice}</p>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {dict.chat.chips.map((chip) => (
              <button key={chip} type="button" className="btn min-h-11 text-sm font-normal" disabled={busy} onClick={() => void ask(chip)}>
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
                {visibleAnswer(t.content) ||
                  (busy && i === turns.length - 1 ? (
                    // 슈퍼바이저 판단(약 1초) → 검색 → 첫 글자까지 걸리는 동안
                    <span className="inline-flex items-center gap-2 text-muted" role="status">
                      <span className="loading loading-dots loading-sm" aria-hidden="true" />
                      {dict.chat.thinking}
                    </span>
                  ) : (
                    ''
                  ))}
              </p>
              {t.sources?.some((slug) => !sourceLink(slug)) && (
                <p className="mt-1 text-xs text-muted">
                  {dict.chat.sources.label}: {t.sources.filter((slug) => !sourceLink(slug)).map(sourceName).join(' · ')}
                </p>
              )}
              {(t.sources?.some((slug) => sourceLink(slug)) || t.notice === 'login' || t.notice === 'letter' || t.content.includes('[[letter]]')) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.sources?.map((slug) => {
                    const link = sourceLink(slug);
                    if (!link) return null;
                    return (
                      <a
                        key={slug}
                        href={link.href}
                        onClick={() => followSource(link.href)}
                        className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-sm"
                      >
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

      <form
        onSubmit={submit}
        aria-busy={busy}
        className={`shrink-0 border-t border-border px-3 pt-2 ${frame?.keyboard ? 'pb-2' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'}`}
      >
        <div className="flex items-center gap-2">
          <textarea
            data-scroll-allow
            ref={inputRef}
            rows={1}
            readOnly={busy}
            // 슬림한 한 줄 입력(40px). iOS 자동 완성 막대(패스키·카드·주소)가 덜 뜨도록 자동 완성 대상이 아님을 알린다
            className="field max-h-32 min-h-10 flex-1 resize-none py-1.5"
            autoComplete="off"
            enterKeyHint="send"
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
          <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()} aria-busy={busy}>
            {dict.chat.send}
          </button>
        </div>
      </form>
    </section>
    </>
  );
}
