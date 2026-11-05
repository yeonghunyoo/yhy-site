// 챗 버튼 자동 숨김·보임(11/05). 버튼(ChatDock의 [data-chat-fab])은 <html data-fab="hidden|shown">을 보고 CSS로 움직인다
// (React가 다시 그려도 클래스가 지워지지 않게 html 속성으로).
// - 홈: 프로젝트 섹션이 화면 아래쪽에 들어올 때쯤 처음 튀어 오른다. 그 위(히어로)에서는 숨는다
// - 아래로 스크롤하면 숨고, 위로 스크롤하거나 잠깐 멈추면 다시 보인다
const IDLE_MS = 700;

export function initChatFab(): void {
  const root = document.documentElement;
  const gate = document.querySelector('[data-hero]') ? document.getElementById('project') : null;
  const gateOpen = () => !gate || gate.getBoundingClientRect().top < innerHeight * 0.85;
  const set = (show: boolean) => {
    const v = show ? 'shown' : 'hidden';
    if (root.dataset.fab !== v) root.dataset.fab = v;
  };

  let lastY = scrollY;
  let idle = 0;
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const dy = scrollY - lastY;
      lastY = scrollY;
      clearTimeout(idle);
      if (!gateOpen()) return set(false);
      if (dy > 4) set(false);
      else if (dy < -4) set(true);
      idle = window.setTimeout(() => gateOpen() && set(true), IDLE_MS);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  set(gateOpen());
}
