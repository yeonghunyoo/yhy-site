// 챗 버튼 보임(11/05). 버튼(ChatDock의 [data-chat-fab])은 <html data-fab="hidden|shown">을 보고 CSS로 움직인다
// (React가 다시 그려도 클래스가 지워지지 않게 html 속성으로).
// - 홈: 히어로 동안 숨어 있다가 프로젝트 섹션이 화면 아래쪽에 들어올 때쯤 튀어 오르고, 그 뒤로는 계속 보인다
//   (11/05 사용자: 스크롤 방향에 따른 자동 숨김은 뺐다). 다시 히어로 쪽으로 올라가면 숨는다
// - 다른 페이지: 처음부터 계속 보인다
export function initChatFab(): void {
  const root = document.documentElement;
  const gate = document.querySelector('[data-hero]') ? document.getElementById('project') : null;
  const set = (show: boolean) => {
    const v = show ? 'shown' : 'hidden';
    if (root.dataset.fab !== v) root.dataset.fab = v;
  };
  if (!gate) {
    set(true);
    return;
  }
  const check = () => set(gate.getBoundingClientRect().top < innerHeight * 0.85);
  let queued = false;
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        check();
      });
    },
    { passive: true },
  );
  check();
}
