// 홈 프로젝트 썸네일 호버 확대(11/05) — 마우스를 올리면 16:10으로 잘린 썸네일이 이미지 원래 비율로
// 화면 안에 맞게 커지고, 마우스를 내리면 제자리로 줄어든다. 자리(레이아웃)는 그대로, 커진 칸만 위에 뜬다.
// 마우스가 있는 기기에서만. 커질 때 sizes를 바꿔 srcset에서 더 큰 이미지를 받는다.
const MARGIN = 16;
/** 아래 여백: 데스크톱 하단 챗 바(높이 56 + 아래 16)에 가리지 않게 */
const BOTTOM = 96;
const MAX_W = 960;

export function initThumbPeek(): void {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  for (const thumb of document.querySelectorAll<HTMLElement>('[data-peek]')) {
    const pop = thumb.querySelector<HTMLElement>('.thumb-pop');
    const img = pop?.querySelector('img');
    // 원본 크기(data-peek="921x2000") — img.naturalWidth는 srcset 밀도로 나눠진 값이라 쓰지 않는다
    const [ow, oh] = (thumb.dataset.peek ?? '').split('x').map(Number);
    if (!pop || !img || !ow || !oh) continue;
    const item = thumb.closest('li');
    let timer = 0;

    thumb.addEventListener('pointerenter', () => {
      clearTimeout(timer);
      const r = thumb.getBoundingClientRect();
      const ratio = ow / oh;
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) * 16 || 56;
      const top0 = header + MARGIN;
      const maxH = innerHeight - top0 - BOTTOM;
      const maxW = Math.min(innerWidth - MARGIN * 2, MAX_W);
      // 원래 비율로 화면 안에 맞추되 원본보다 키우지는 않는다
      const h = Math.max(r.height, Math.min(maxH, maxW / ratio, oh));
      const w = h * ratio;
      // 썸네일 가운데를 기준으로 펼치고 화면 밖으로 나가지 않게
      const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, MARGIN), innerWidth - MARGIN - w);
      const top = Math.min(Math.max(r.top + r.height / 2 - h / 2, top0), innerHeight - BOTTOM - h);
      pop.style.left = `${left - r.left}px`;
      pop.style.top = `${top - r.top}px`;
      pop.style.width = `${w}px`;
      pop.style.height = `${h}px`;
      img.sizes = `${Math.ceil(w)}px`;
      thumb.classList.add('is-pop');
      item?.classList.add('is-pop');
    });

    thumb.addEventListener('pointerleave', () => {
      for (const k of ['left', 'top', 'width', 'height']) pop.style.removeProperty(k);
      thumb.classList.remove('is-pop');
      // 줄어드는 동안은 다음 항목 위에 떠 있게
      timer = window.setTimeout(() => item?.classList.remove('is-pop'), 450);
    });
  }
}
