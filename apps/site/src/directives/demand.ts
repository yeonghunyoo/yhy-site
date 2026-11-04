import type { ClientDirective } from 'astro';

// client:demand — React 아일랜드를 필요할 때만 하이드레이트한다(초기 JS 예산 50KB).
// - 토스트 예약·새로고침 재개가 있으면 바로
// - 아니면 [data-action] 버튼(레터·챗)을 처음 누를 때. 누른 동작은 window.__uiPending으로 넘긴다.
// 방문자 로그인이 없어(11/04) 세션은 묻지 않는다.

declare global {
  interface Window {
    __uiPending?: string;
    /** 첫 클릭으로 시작해 아직 하이드레이트 중인 아일랜드 수(로딩 표시를 언제 끌지) */
    __uiHydrating?: number;
    __staleChunkGuard?: boolean;
    __uiResumed?: boolean;
  }
}

const ACTIONS = new Set(['letter', 'chat']);
const RESUME_KEY = 'uiResume';
const RELOADED_KEY = 'uiReloadedAt';

// 배포 뒤 예전 HTML(오래 열어 둔 탭, Safari의 bfcache·탭 복원)은 사라진 /_astro/*.js를 불러 하이드레이트가 404로 실패한다.
// 모듈을 못 불러온 하이드레이트 오류면 한 번만 새로고침해 새 HTML을 받고, 누르던 동작을 이어간다(docs/guides/browser-support.md).
// 오류 문구: Chrome "Failed to fetch dynamically imported module", Safari "Importing a module script failed", Firefox "error loading dynamically imported module"
const STALE_CHUNK = /dynamically imported module|Importing a module script failed/i;
if (typeof window !== 'undefined' && !window.__staleChunkGuard) {
  window.__staleChunkGuard = true;
  document.addEventListener('astro:hydration-error', (e) => {
    const error = (e as CustomEvent<{ error: unknown }>).detail?.error;
    if (!STALE_CHUNK.test(String((error as Error)?.message ?? error))) return;
    try {
      const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
      if (Date.now() - last < 60_000) return; // 방금 새로고침했는데도 실패 — 반복하지 않는다
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
      if (window.__uiPending) sessionStorage.setItem(RESUME_KEY, window.__uiPending);
    } catch {
      return; // 저장소를 못 쓰면(사파리 사설 모드 일부) 반복 방지를 못 하므로 새로고침하지 않는다
    }
    location.reload();
  });
}

function hasPendingState(): boolean {
  // 오래된 파일 때문에 새로고침했다면 누르던 동작(레터·챗)을 이어간다
  // (아일랜드마다 불리므로 처음 읽은 결과를 window에 남겨 모두가 바로 하이드레이트한다)
  if (window.__uiResumed) return true;
  try {
    const resume = sessionStorage.getItem(RESUME_KEY);
    if (resume && ACTIONS.has(resume)) {
      sessionStorage.removeItem(RESUME_KEY);
      window.__uiPending = resume;
      window.__uiResumed = true;
      return true;
    }
  } catch {}
  try {
    return Boolean(sessionStorage.getItem('flashToast'));
  } catch {
    return false;
  }
}

const demand: ClientDirective = (load) => {
  let started = false;

  const start = async () => {
    if (started) return;
    started = true;
    document.removeEventListener('click', onClick, true);
    window.__uiHydrating = (window.__uiHydrating ?? 0) + 1;
    try {
      const hydrate = await load();
      await hydrate();
    } finally {
      // 누른 버튼의 로딩 표시(global.css의 html[data-ui-pending]) — 같은 클릭으로 시작한 아일랜드가 모두 끝나면 끈다
      window.__uiHydrating -= 1;
      if (window.__uiHydrating === 0) delete document.documentElement.dataset.uiPending;
    }
  };

  function onClick(e: MouseEvent) {
    const action = (e.target as Element | null)?.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (!action || !ACTIONS.has(action)) return;
    e.preventDefault();
    window.__uiPending = action;
    // React를 받는 동안(느린 회선에서는 수 초) 누른 버튼에 스피너. 아일랜드의 DOM은 건드리지 않는다(하이드레이션 불일치 방지)
    document.documentElement.dataset.uiPending = action;
    void start();
  }

  document.addEventListener('click', onClick, true);
  if (hasPendingState()) void start();
};

export default demand;
