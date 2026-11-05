// 홈 플로팅 목차(11/05, 데스크톱 1200px+ — CSS가 보임을 정한다).
// 본문(#about)이 화면에 들어오면 나타나고(히어로 동안은 숨김), 기준선(화면 위에서 35%)이 지나간 마지막 섹션을 aria-current로 표시.
export function initToc(): void {
  const nav = document.querySelector<HTMLElement>('[data-toc]');
  if (!nav) return;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')];
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter((el): el is HTMLElement => !!el);
  if (!sections.length) return;
  let queued = false;
  const update = () => {
    queued = false;
    const line = innerHeight * 0.35;
    nav.classList.toggle('is-on', sections[0].getBoundingClientRect().top < innerHeight * 0.8);
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    for (const a of links) a.setAttribute('aria-current', String(a.hash === `#${current.id}`));
  };
  const request = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  update();
}
