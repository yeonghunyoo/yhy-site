// 보이는 영역(visualViewport) 추적 — 챗 독과 시트가 같이 쓴다(docs/guides/browser-support.md).
// iOS는 키보드가 오르내리는 동안 보이는 영역의 높이·위치를 애니메이션으로 바꾸는데, 이벤트를 매 프레임 주지 않는다.
// React 상태로 받으면 한두 프레임씩 늦게 그려져 창이 아래에서 위로 밀렸다 올라오는 것처럼 보인다.
// 그래서 이벤트가 오면 약 0.7초 동안 매 프레임 값을 다시 읽어, 부르는 쪽이 DOM 스타일을 바로 고치게 한다.

export interface ViewportFrame {
  height: number;
  top: number;
  /** 키보드가 떠 있는지(열린 뒤 본 가장 큰 높이보다 120px 넘게 작으면) */
  keyboard: boolean;
}

const FOLLOW_MS = 700;

/** onFrame을 지금 한 번, 그 뒤 보이는 영역이 바뀔 때마다 프레임 단위로 부른다. 멈추는 함수를 돌려준다. */
export function watchViewport(onFrame: (frame: ViewportFrame) => void): () => void {
  const vv = window.visualViewport;
  // Chrome Android(interactive-widget=resizes-content)는 innerHeight도 같이 줄어, 열린 뒤 본 가장 큰 높이와 비교한다
  let full = vv?.height ?? window.innerHeight;
  let until = 0;
  let raf = 0;
  let last = '';

  const read = () => {
    const height = vv?.height ?? window.innerHeight;
    const top = vv?.offsetTop ?? 0;
    full = Math.max(full, height);
    const key = `${height}|${top}`;
    if (key === last) return;
    last = key;
    onFrame({ height, top, keyboard: height < full - 120 });
  };
  const loop = () => {
    read();
    raf = performance.now() < until ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => {
    until = performance.now() + FOLLOW_MS;
    if (!raf) raf = requestAnimationFrame(loop);
  };

  read();
  vv?.addEventListener('resize', kick);
  vv?.addEventListener('scroll', kick);
  // 키보드가 내려가기 시작할 때 iOS가 resize보다 먼저 focusout을 준다 — 그때부터 따라간다
  document.addEventListener('focusout', kick);
  document.addEventListener('focusin', kick);
  return () => {
    cancelAnimationFrame(raf);
    vv?.removeEventListener('resize', kick);
    vv?.removeEventListener('scroll', kick);
    document.removeEventListener('focusout', kick);
    document.removeEventListener('focusin', kick);
  };
}
