// 터치 탭(docs/01-frontend.md "홈", 11/03 변경): 드래그로 따라가지 않는다. 누른 자리에 잠깐 보였다 사라지고,
// 스크롤은 막지 않는다(passive). 마우스는 부르는 쪽이 pointer 이벤트로 따로 다룬다.
export interface TapHandlers {
  start(x: number, y: number): void;
  end(): void;
}

export function tapPeek(el: HTMLElement, { start, end }: TapHandlers, showMs = 900): void {
  let timer = 0;
  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      start(t.clientX, t.clientY);
      clearTimeout(timer);
      timer = window.setTimeout(end, showMs);
    },
    { passive: true },
  );
}
