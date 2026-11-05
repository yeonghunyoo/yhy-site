// 스크롤 포커스(11/05): [data-focus-list] 목록에서 화면 세로 가운데 띠(위아래 40%를 뺀 20%)에 걸친 항목 하나만 .is-focus.
// 목록에는 .is-focus-mode를 붙여 나머지를 흐리게 하고 설명을 접는다(CSS는 홈 페이지). 스크립트가 없으면 모두 선명·펼침.
// 움직임 줄이기면 하지 않는다(흐림·접힘 없이 다 보인다).
export function initFocusList(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const list of document.querySelectorAll<HTMLElement>('[data-focus-list]')) {
    const items = [...list.children] as HTMLElement[];
    if (!items.length) continue;
    list.classList.add('is-focus-mode');
    const inBand = new Set<HTMLElement>();
    const pick = () => {
      // 띠에 여러 개가 걸치면 중심이 화면 가운데에 가장 가까운 것
      const mid = innerHeight / 2;
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      for (const el of inBand) {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = el;
        }
      }
      if (best) for (const el of items) el.classList.toggle('is-focus', el === best);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target as HTMLElement);
          else inBand.delete(e.target as HTMLElement);
        }
        pick();
      },
      { rootMargin: '-40% 0px -40% 0px' },
    );
    items.forEach((el) => io.observe(el));
    // 첫 항목은 처음부터 선명하게(목록이 막 보일 때 전부 흐리면 비어 보인다)
    items[0].classList.add('is-focus');
  }
}
