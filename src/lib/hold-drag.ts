// 터치에서 "누른 채로 드래그"(docs/01-frontend.md "홈"): 잠깐(0.18초) 누르고 있으면 손가락에 붙어 따라가고 그동안 스크롤을 막는다.
// 바로 쓸면 평소처럼 스크롤하고 효과는 닫는다. 마우스는 부르는 쪽이 pointer 이벤트로 따로 다룬다.
export interface HoldDragHandlers {
  start(x: number, y: number): void;
  move(x: number, y: number): void;
  end(): void;
}

export function holdDrag(el: HTMLElement, { start, move, end }: HoldDragHandlers, holdMs = 180): void {
  let active = false;
  let sx = 0;
  let sy = 0;
  let timer = 0;
  el.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      active = false;
      start(t.clientX, t.clientY);
      clearTimeout(timer);
      timer = window.setTimeout(() => (active = true), holdMs);
    },
    { passive: true },
  );
  el.addEventListener(
    'touchmove',
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      if (!active) {
        if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) {
          clearTimeout(timer);
          end();
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      move(t.clientX, t.clientY);
    },
    { passive: false },
  );
  const fin = () => {
    clearTimeout(timer);
    active = false;
    end();
  };
  el.addEventListener('touchend', fin);
  el.addEventListener('touchcancel', fin);
}
