// 길게 눌러(클릭) 끌어도 링크·이미지가 브라우저 기본 드래그로 끌려 나오지 않게 한다(11/06).
// Chrome·Safari는 CSS(-webkit-user-drag, global.css)로 되지만 Firefox·Android 길게 누르기 드래그는 dragstart를 막아야 한다.
// 입력란 안의 글자 끌기는 그대로 둔다
export function initNoDrag(): void {
  document.addEventListener('dragstart', (e) => {
    const el = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
    if (el?.closest('input, textarea, [contenteditable]')) return;
    e.preventDefault();
  });
}
