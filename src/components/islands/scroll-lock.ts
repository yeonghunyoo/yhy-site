// 배경 스크롤 잠금 — 챗 독과 시트(로그인·레터·계정)가 같이 쓴다(docs/guides/browser-support.md).
// iOS Safari는 html/body의 overflow:hidden만으로는 배경이 밀려 스크롤되므로 body를 position:fixed로 고정하고,
// 풀 때 원래 스크롤 위치로 되돌린다. 챗 위에 로그인 시트가 겹쳐 열릴 수 있어 잠근 횟수를 센다(마지막이 풀 때만 복원).
// 아일랜드는 번들이 나뉠 수 있어 상태는 window에 둔다.

interface LockState {
  count: number;
  y: number;
  saved: { position: string; top: string; width: string; overflow: string };
}

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
    window.scrollTo(0, state.y);
  };
}
