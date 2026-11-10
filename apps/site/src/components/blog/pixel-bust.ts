// 블로그 자리표시 컴포넌트(docs/08-blog.md "자리표시 컴포넌트", S-019) — 히어로의 픽셀 3D 장면(src/lib/hero/scene.js)을 글 안에.
// 화면에 있는 동안 카메라가 정면 ↔ 오른쪽 대각을 천천히 오가고, 눈 숫자가 바뀐다. 화면 밖·탭 숨김이면 멈춘다.
// 움직임 줄이기면 한 장면에 멈춘다. WebGL이 없으면 아무것도 하지 않는다(대체 글이 그대로 보인다). three.js는 이 컴포넌트를 쓰는 글에서만 받는다.
const LOOP_MS = 14000;
const EYE_TICK_MS = 1000 / 12;

export async function mount(el: HTMLElement, props: { height?: number }): Promise<void> {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) return;
  const height = Math.min(720, Math.max(200, Number(props.height) || 420));
  const canvas = document.createElement('canvas');
  canvas.className = 'blog-embed-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.height = `${height}px`; // DOM 속성이라 CSP와 상관없다(HTML style=""만 막힌다)
  el.insertBefore(canvas, el.firstChild);

  const { createHero } = await import('../../lib/hero/scene.js');
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const hero = createHero(canvas, {
    palette: { dark: token('--color-bg', '#17191c'), light: token('--color-fg', '#e9ebe6'), accent: token('--color-accent', '#8c98ff') },
  });
  await hero.prepare();
  new ResizeObserver(() => hero.resize(canvas.clientWidth, canvas.clientHeight)).observe(canvas);
  hero.resize(canvas.clientWidth, canvas.clientHeight);
  el.classList.add('is-live');

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hero.setProgress(0.2);
    return;
  }
  let visible = false;
  let raf = 0;
  let lastTick = 0;
  let tick = 0;
  const frame = (t: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    hero.setProgress(0.15 - 0.15 * Math.cos((t / LOOP_MS) * 2 * Math.PI)); // 0 ~ 0.3: 정면 멀리 → 오른쪽 대각
    if (t - lastTick >= EYE_TICK_MS) {
      lastTick = t;
      hero.setTick((tick = (tick + 1) % 4096));
    }
    raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    visible = Boolean(e?.isIntersecting);
    kick();
  }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
}
