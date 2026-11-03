// 배경 스크롤 잠금 — 챗 독과 시트(로그인·레터·계정)가 같이 쓴다(docs/guides/browser-support.md).
// iOS Safari는 html/body의 overflow:hidden만으로는 배경이 밀려 스크롤되므로 body를 position:fixed로 고정하고,
// 풀 때 원래 스크롤 위치로 되돌린다. 챗 위에 로그인 시트가 겹쳐 열릴 수 있어 잠근 횟수를 센다(마지막이 풀 때만 복원).
// 아일랜드는 번들이 나뉠 수 있어 상태는 window에 둔다.

interface LockState {
  count: number;
  y: number;
  saved: { position: string; top: string; width: string; overflow: string };
}

/**
 * 잠긴 동안의 터치 스크롤 막기. iOS는 body를 고정해도 키보드가 떠 있으면 보이는 영역(visualViewport)을 손가락으로
 * 밀 수 있어, 챗·시트 아래로 뒤 페이지가 드러난다. `data-scroll-allow` 안에서 실제로 스크롤할 수 있는 방향만 허용하고
 * 나머지 touchmove는 막는다(docs/guides/browser-support.md).
 */
let startY = 0;
const onTouchStart = (e: TouchEvent) => {
  startY = e.touches[0]?.clientY ?? 0;
};
const onTouchMove = (e: TouchEvent) => {
  if (e.touches.length > 1) return; // 핀치 확대는 그대로
  const box = (e.target as Element | null)?.closest?.<HTMLElement>('[data-scroll-allow]');
  if (box) {
    const dy = (e.touches[0]?.clientY ?? 0) - startY; // 양수 = 아래로 끌기(위로 스크롤)
    const atTop = box.scrollTop <= 0;
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
    const scrollable = box.scrollHeight > box.clientHeight;
    if (scrollable && !(dy > 0 && atTop) && !(dy < 0 && atBottom)) return;
  }
  if (e.cancelable) e.preventDefault();
};

declare global {
  interface Window {
    __scrollLock?: LockState;
  }
}

/** 잠그고, 푸는 함수를 돌려준다(여러 번 불러도 한 번만 푼다). */
export function lockScroll(): () => void {
  const state = (window.__scrollLock ??= { count: 0, y: 0, saved: { position: '', top: '', width: '', overflow: '' } });
  const { body, documentElement: html } = document;
  if (state.count++ === 0) {
    state.y = window.scrollY;
    state.saved = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: html.style.overflow };
    body.style.position = 'fixed';
    body.style.top = `-${state.y}px`;
    body.style.width = '100%';
    html.style.overflow = 'hidden';
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.count > 0) return;
    body.style.position = state.saved.position;
    body.style.top = state.saved.top;
    body.style.width = state.saved.width;
    html.style.overflow = state.saved.overflow;
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    window.scrollTo(0, state.y);
  };
}
