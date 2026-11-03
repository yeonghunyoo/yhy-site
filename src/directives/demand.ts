import type { ClientDirective } from 'astro';

// client:demand — React 아일랜드를 필요할 때만 하이드레이트한다(초기 JS 예산 50KB).
// - 로그인 상태이거나 로그인 복귀(?signed_in·?auth_error)·토스트 예약이 있으면 바로
// - 아니면 [data-action] 버튼(로그인·레터)을 처음 누를 때. 누른 동작은 window.__uiPending으로 넘긴다.

declare global {
  interface Window {
    __uiPending?: string;
    /** 첫 클릭으로 시작해 아직 하이드레이트 중인 아일랜드 수(로딩 표시를 언제 끌지) */
    __uiHydrating?: number;
    __sessionCheck?: Promise<boolean>;
  }
}

const ACTIONS = new Set(['login', 'letter', 'chat']);

function hasPendingState(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('signed_in') || params.has('auth_error')) return true;
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
  if (hasPendingState()) {
    void start();
    return;
  }
  // 세션 쿠키는 HttpOnly라 직접 볼 수 없다 — 아일랜드끼리 한 번만 물어본다.
  window.__sessionCheck ??= fetch('/auth/get-session', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then(Boolean)
    .catch(() => false);
  void window.__sessionCheck.then((signedIn) => {
    if (signedIn) void start();
  });
};

export default demand;
