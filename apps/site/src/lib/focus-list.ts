// 포커스 강조(11/05): [data-focus-list] 목록에서 기준선에 가장 가까운 항목 하나만 .is-focus.
// 기준선: 마우스가 있는 기기는 마우스 세로 위치(마우스를 두고 스크롤해도 항목이 그 아래로 지나가 같은 효과),
// 터치 기기·마우스가 화면 밖이면 화면 가운데. 목록에는 .is-focus-mode를 붙여 나머지를 흐리게 한다(CSS는 홈 페이지).
// 스크립트가 없거나 움직임 줄이기면 하지 않는다(흐림 없이 다 보인다).
export function initFocusList(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const lists = [...document.querySelectorAll<HTMLElement>('[data-focus-list]')]
    .map((list) => ({ list, items: [...list.children] as HTMLElement[] }))
    .filter((l) => l.items.length);
  if (!lists.length) return;

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let pointerY: number | null = null;
  let queued = false;

  const update = () => {
    queued = false;
    const line = pointerY ?? innerHeight / 2;
    for (const { list, items } of lists) {
      const box = list.getBoundingClientRect();
      // 목록이 화면 밖이면 그대로 둔다
      if (box.bottom < 0 || box.top > innerHeight) continue;
      let best = items[0];
      let bestD = Infinity;
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const d = line < r.top ? r.top - line : line > r.bottom ? line - r.bottom : 0; // 항목 안이면 0
        if (d < bestD) {
          bestD = d;
          best = el;
        }
      }
      for (const el of items) el.classList.toggle('is-focus', el === best);
    }
  };
  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  for (const { list, items } of lists) {
    list.classList.add('is-focus-mode');
    items[0].classList.add('is-focus');
  }
  if (finePointer) {
    addEventListener('pointermove', (e) => { pointerY = e.clientY; request(); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointerY = null; request(); });
  }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  request();
}
