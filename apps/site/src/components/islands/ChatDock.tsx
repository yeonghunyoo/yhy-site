import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react';
import type { Dict, Locale } from '../../i18n';
import type { Diagram } from '../../lib/diagram';
import followupSet from '../../content/rag/followups.json';
import { ChatMarkdown } from './chat-markdown';
import { visibleAnswer } from './chat-text';
import { lockScroll } from './scroll-lock';
import { watchViewport } from './viewport';

// 흐름도 렌더러는 흐름도 답이 왔을 때만 불러온다(초기 JS 예산 밖, docs/05-06-chat-rag.md "흐름도 에이전트")
const DiagramView = lazy(() => import('./diagram/DiagramView'));

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
  notice?: 'letter' | 'error';
  /** 흐름도 답이면 그림 데이터(서버로 보내는 대화 기록에는 넣지 않는다) */
  diagram?: Diagram;
}

const HISTORY_KEY = 'chatHistory';
const MAX_QUESTION = 500;
// client:demand의 이어가기 키(src/directives/demand.ts) — 다음 페이지에서 챗을 바로 연다
const RESUME_KEY = 'uiResume';
const FOLLOWUP_MAX = 3;
// 데스크톱 표시 방식(11/05): 위젯(우하단 패널) / 하단 바(아래 가운데 넓은 패널). 브라우저에 기억
const MODE_KEY = 'chatMode';
type Mode = 'widget' | 'bar';
const desktop = () => window.innerWidth >= 768;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 독 버튼 자리(열 때 출발점, 닫을 때 도착점) */
const fabRect = (): DOMRect | null => document.querySelector('[data-chat-fab]')?.getBoundingClientRect() ?? null;

type FollowupSet = Record<string, Partial<Record<Locale, string[]>>>;
const sameQuestion = (a: string, b: string) => a.replace(/[\s?？.!]/g, '').toLowerCase() === b.replace(/[\s?？.!]/g, '').toLowerCase();

/** 마지막 답 아래 "이어서 물어보기" — 출처 slug 순서대로 모으고 이미 물은 질문은 뺀다(docs/05-06-chat-rag.md "답 아래 표시 세 종류") */
function followups(sources: string[] | undefined, asked: string[], locale: Locale): string[] {
  const set = followupSet as unknown as FollowupSet;
  const keys = sources?.length ? [...sources, 'default'] : ['default'];
  const out: string[] = [];
  for (const key of keys) {
    for (const q of set[key]?.[locale] ?? []) {
      if (out.length >= FOLLOWUP_MAX) return out;
      if (!out.some((o) => sameQuestion(o, q)) && !asked.some((a) => sameQuestion(a, q))) out.push(q);
    }
  }
  return out;
}

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
  const [mode, setMode] = useState<Mode>('widget');
  // 열기 전 독 버튼 자리 — 패널이 그 자리에서 커진다(히어로 전환, 11/05)
  const fromRef = useRef<DOMRect | null>(null);
  const closing = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTurns(load());
    try {
      if (localStorage.getItem(MODE_KEY) === 'bar') setMode('bar');
    } catch {}
    // 하이드레이트를 일으킨 독 버튼 클릭(client:demand)
    if (window.__uiPending === 'chat') {
      window.__uiPending = undefined;
      fromRef.current = fabRect();
      setOpen(true);
    }
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('[data-action="chat"]')) {
        fromRef.current = fabRect();
        setOpen(true);
      }
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]') && minimize();
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

  // 히어로 전환(데스크톱): 패널이 독 버튼 자리·크기에서 제자리로 커진다. 안의 내용은 조금 늦게 나타난다
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const from = fromRef.current;
    fromRef.current = null;
    if (!open || !panel || !from || !desktop() || reduced()) return;
    const to = panel.getBoundingClientRect();
    panel.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, borderRadius: '12px' },
        { transformOrigin: '0 0', transform: 'none', borderRadius: '20px' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1)' },
    );
    panel.querySelectorAll('[data-chat-inner]').forEach((el) =>
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 200, easing: 'ease-out', fill: 'backwards' }),
    );
  }, [open, mode]);

  /** 닫기 = 최소화: 대화는 남고, 데스크톱이면 패널이 독 버튼 자리로 줄어든 뒤 버튼이 된다 */
  function minimize() {
    const panel = panelRef.current;
    if (!panel || !desktop() || reduced() || closing.current) {
      setOpen(false);
      return;
    }
    closing.current = true;
    const to = panel.getBoundingClientRect();
    // 버튼은 닫힌 뒤에 그려지므로 마지막 자리(우하단, 대략 크기)로 간다
    const w = 220;
    const h = 48;
    const left = window.innerWidth - 16 - w;
    const top = window.innerHeight - 16 - h;
    panel.querySelectorAll('[data-chat-inner]').forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
    panel
      .animate(
        [
          { transformOrigin: '0 0', transform: 'none', opacity: 1 },
          { transformOrigin: '0 0', transform: `translate(${left - to.left}px, ${top - to.top}px) scale(${w / to.width}, ${h / to.height})`, opacity: 0.6 },
        ],
        { duration: 300, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
      )
      .finished.finally(() => {
        closing.current = false;
        setOpen(false);
      });
  }

  function switchMode() {
    const next: Mode = mode === 'widget' ? 'bar' : 'widget';
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
    // 지금 자리에서 새 자리로 옮겨 가게 한다
    fromRef.current = panelRef.current?.getBoundingClientRect() ?? null;
    setMode(next);
  }

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
        // 하루 턴 한도(IP당 20, 11/04) — 레터로 이어가기
        patchLast({ content: dict.chat.limit, notice: 'letter' });
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
          const event = JSON.parse(line) as { t: 'delta' | 'diagram' | 'done' | 'error'; text?: string; sources?: string[]; sig?: string; diagram?: Diagram };
          if (event.t === 'delta') patchLast((t) => ({ content: t.content + (event.text ?? '') }));
          if (event.t === 'diagram' && event.diagram) patchLast({ diagram: event.diagram });
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
  // 다른 페이지로 갈 때 데스크톱은 이동한 페이지에서 패널을 다시 연다(페이지 옆에 떠 있어 내용을 가리지 않는다).
  // 모바일은 화면 전체를 덮으므로 다시 열지 않는다 — 대화는 sessionStorage에 남아 독 버튼으로 이어진다.
  const followSource = (href: string) => {
    if (href.split('#')[0] === location.pathname) {
      minimize();
      return;
    }
    if (window.innerWidth >= 768) {
      try {
        sessionStorage.setItem(RESUME_KEY, 'chat');
      } catch {}
    }
  };
  const asked = turns.filter((t) => t.role === 'user').map((t) => t.content);

  if (!open) {
    return (
      <button
        type="button"
        data-action="chat"
        data-chat-fab
        aria-label={dict.chat.open}
        className="chat-fab fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex min-h-12 items-center gap-2 rounded-full bg-surface/95 px-5 font-mono text-sm text-fg shadow-[0_12px_32px_rgb(0_0_0/0.5)] backdrop-blur"
      >
        {/* 터미널 프롬프트 모양(11/05): $ + 문구 + 깜빡이는 커서, 테두리 없이 둥글게. 홈에서는 프로젝트 즈음부터 보인다(src/lib/chat-fab.ts) */}
        <span className="text-accent" aria-hidden="true">$</span>
        <span>{dict.chat.fab}</span>
        <span className="chat-fab-caret" aria-hidden="true" />
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
      // 테두리 없이 그림자와 둥근 모서리(11/05). 데스크톱: 위젯(우하단 380px) / 하단 바(아래 가운데, 최대 760px)
      className={`fixed inset-x-0 top-0 bottom-0 z-40 flex flex-col bg-surface md:top-auto md:bottom-4 md:rounded-[20px] md:shadow-[0_24px_64px_rgb(0_0_0/0.55)] ${
        mode === 'bar'
          ? 'md:mx-auto md:h-[min(62dvh,600px)] md:w-[min(760px,calc(100vw-2rem))]'
          : 'md:left-auto md:right-4 md:h-[560px] md:max-h-[calc(100dvh-2rem)] md:w-[380px]'
      }`}
    >
      <header data-chat-inner className={`flex shrink-0 items-center justify-between pr-2 pl-5 ${frame?.keyboard ? '' : 'pt-[env(safe-area-inset-top)]'}`}>
        <h2 className="font-mono text-sm text-muted">
          <span className="text-accent">$</span> {dict.chat.title}
        </h2>
        <div className="flex items-center">
          <button
            type="button"
            onClick={switchMode}
            className="hidden size-11 place-items-center rounded-full text-muted hover:text-fg md:grid"
            aria-label={mode === 'widget' ? dict.chat.mode.bar : dict.chat.mode.widget}
            title={mode === 'widget' ? dict.chat.mode.bar : dict.chat.mode.widget}
          >
            {mode === 'widget' ? (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="3" y="13" width="18" height="7" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="11" y="8" width="10" height="12" rx="2" />
              </svg>
            )}
          </button>
          <button type="button" onClick={minimize} className="grid size-11 place-items-center rounded-full text-xl text-muted hover:text-fg" aria-label={dict.ui.close}>
            ×
          </button>
        </div>
      </header>

      <div ref={listRef} data-chat-inner data-scroll-allow className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-2" aria-live="polite">
        <p className="rounded-2xl bg-bg px-4 py-2.5">{dict.chat.greeting}</p>
        {/* 개인정보 고지 — 입력란 아래에서 옮겼다(11/03, 입력 영역을 좁게) */}
        <p className="px-1 text-xs text-muted">{dict.chat.notice}</p>
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {dict.chat.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent/10 px-3 text-left text-sm text-fg"
                disabled={busy}
                onClick={() => void ask(chip)}
              >
                <span className="text-accent" aria-hidden="true">↳</span>
                {chip}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <p key={i} className="ml-8 rounded-2xl rounded-br-md bg-accent px-4 py-2.5 break-words text-accent-fg">
              {t.content}
            </p>
          ) : (
            <div key={i} className="mr-8">
              {/* 답은 작은 마크다운(목록·굵게)으로 그린다 — HTML로 해석하지 않는다(chat-markdown.tsx) */}
              <div className={`rounded-2xl rounded-bl-md bg-bg px-4 py-2.5 break-words ${t.notice === 'error' ? 'text-danger' : ''}`}>
                {(visibleAnswer(t.content) && <ChatMarkdown text={visibleAnswer(t.content)} />) ||
                  (busy && i === turns.length - 1 ? (
                    // 슈퍼바이저 판단(약 1초) → 검색 → 첫 글자까지 걸리는 동안
                    <span className="inline-flex items-center gap-2 text-muted" role="status">
                      <span className="loading loading-dots loading-sm" aria-hidden="true" />
                      {dict.chat.thinking}
                    </span>
                  ) : (
                    ''
                  ))}
              </div>
              {t.diagram && (
                <Suspense fallback={<span className="loading loading-dots loading-sm mt-2 text-muted" aria-hidden="true" />}>
                  <DiagramView diagram={t.diagram} labels={dict.chat.diagram} />
                </Suspense>
              )}
              {t.sources?.some((slug) => !sourceLink(slug)) && (
                <p className="mt-1 text-xs text-muted">
                  {dict.chat.sources.label}: {t.sources.filter((slug) => !sourceLink(slug)).map(sourceName).join(' · ')}
                </p>
              )}
              {(t.notice === 'letter' || t.content.includes('[[letter]]')) && (
                <div className="mt-2">
                  <button type="button" data-action="letter" className="btn min-h-11 text-sm">
                    {dict.chat.letter}
                  </button>
                </div>
              )}
              {/* 관련 페이지(이동) — 테두리 알약 + ↗. 누르면 페이지를 옮긴다 */}
              {t.sources?.some((slug) => sourceLink(slug)) && (
                <nav className="mt-2" aria-label={dict.chat.pages}>
                  <p className="mb-1 px-1 text-xs text-quiet">{dict.chat.pages}</p>
                  <div className="flex flex-wrap gap-2">
                    {t.sources.map((slug) => {
                      const link = sourceLink(slug);
                      if (!link) return null;
                      return (
                        <a
                          key={slug}
                          href={link.href}
                          onClick={() => followSource(link.href)}
                          aria-label={`${link.label} — ${dict.chat.goTo}`}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted"
                        >
                          {link.label}
                          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                            <path d="M6 3h7v7M13 3 4 12" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      );
                    })}
                  </div>
                </nav>
              )}
              {/* 이어서 물어보기 — 마지막 답 아래에만. 채운 연한 강조색 알약 + ↳. 누르면 그 질문을 보낸다 */}
              {i === turns.length - 1 && !busy && !t.notice && visibleAnswer(t.content) && (() => {
                const next = followups(t.sources, asked, locale);
                if (!next.length) return null;
                return (
                  <div className="mt-3">
                    <p className="mb-1 px-1 text-xs text-quiet">{dict.chat.followups}</p>
                    <div className="flex flex-wrap gap-2">
                      {next.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => void ask(q)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-accent/10 px-3 text-left text-sm text-fg"
                        >
                          <span className="text-accent" aria-hidden="true">↳</span>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          ),
        )}
      </div>

      <form
        onSubmit={submit}
        aria-busy={busy}
        data-chat-inner
        className={`shrink-0 px-3 pt-2 ${frame?.keyboard ? 'pb-2' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}
      >
        {/* 입력란과 보내기 버튼은 같은 높이(44px, 11/05). 여러 줄이면 입력란만 커지고 버튼은 아래에 붙는다 */}
        <div className="flex items-end gap-2 rounded-2xl bg-bg p-1.5">
          <textarea
            data-scroll-allow
            ref={inputRef}
            rows={1}
            readOnly={busy}
            // 한 줄 입력(44px = 보내기 버튼과 같은 높이, 16px 글자로 iOS 확대 방지). iOS 자동 완성 막대(패스키·카드·주소)가 덜 뜨도록 자동 완성 대상이 아님을 알린다
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-[0.6875rem] text-base leading-[1.375rem] outline-none placeholder:text-quiet"
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
          <button type="submit" className="btn btn-primary h-11 min-h-11 shrink-0 rounded-xl" disabled={busy || !input.trim()} aria-busy={busy}>
            {dict.chat.send}
          </button>
        </div>
      </form>
    </section>
    </>
  );
}
