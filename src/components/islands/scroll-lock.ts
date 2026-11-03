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
 * (겹쳐 있으면 바깥 허용 영역까지 본다) 나머지 touchmove는 막는다(docs/guides/browser-support.md).
 */
let startX = 0;
let startY = 0;
const onTouchStart = (e: TouchEvent) => {
  startX = e.touches[0]?.clientX ?? 0;
  startY = e.touches[0]?.clientY ?? 0;
};
/** 끄는 방향으로 실제로 더 스크롤할 수 있는지(dx·dy 양수 = 오른쪽·아래로 끌기 = 왼쪽·위로 스크롤) */
function canScroll(box: HTMLElement, dx: number, dy: number): boolean {
  if (Math.abs(dx) > Math.abs(dy)) {
    if (box.scrollWidth <= box.clientWidth) return false;
    return dx > 0 ? box.scrollLeft > 0 : box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
  }
  if (box.scrollHeight <= box.clientHeight) return false;
  return dy > 0 ? box.scrollTop > 0 : box.scrollTop + box.clientHeight < box.scrollHeight - 1;
}
const onTouchMove = (e: TouchEvent) => {
  if (e.touches.length > 1) return; // 핀치 확대는 그대로
  const dx = (e.touches[0]?.clientX ?? 0) - startX;
  const dy = (e.touches[0]?.clientY ?? 0) - startY;
  // 허용 영역이 겹쳐 있으면(목록 안의 가로 스크롤 상자 등) 바깥으로 올라가며 그 방향으로 스크롤할 수 있는 곳을 찾는다
  let box = (e.target as Element | null)?.closest?.<HTMLElement>('[data-scroll-allow]');
  while (box) {
    if (canScroll(box, dx, dy)) return;
    box = box.parentElement?.closest<HTMLElement>('[data-scroll-allow]');
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
