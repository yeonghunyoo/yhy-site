// 홈 히어로 — 스크롤 진행도로 3D 픽셀 장면·문구·패럴랙스 커튼을 움직인다(docs/guides/3d-hero.md).
// 3D(three.js)는 WebGL이 될 때만 동적 import — 초기 JS 예산(50KB) 밖. 그 전·안 될 때는 포스터 이미지.
// prefers-reduced-motion이면 아무것도 하지 않는다: 짧은 정적 히어로(포스터 + 마지막 문구)가 그대로 보인다.
import type { Hero } from './scene.js';

/** 히어로 구간 길이(화면 높이 배수). CSS의 .story.is-live 높이(100 + 252 + 100 + 100vh)와 맞춘다 */
const HERO_VH = 2.52;
/** 마지막 문장에 머무는 구간(11/05) */
const HOLD_VH = 1;
/** 카메라가 다 빠지면(p ≥ OUTRO_AT) 픽셀이 가운데로 모여 사라지는 정리를 시간으로 자동 재생한다 — 스크롤과 무관(11/05) */
const OUTRO_AT = 0.98;
const OUTRO_IN_MS = 1400;
const OUTRO_OUT_MS = 600;
/** 커튼 구간에서 뒤 장면이 올라가는 속도(본문 대비) */
const PARALLAX = 0.35;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function hasWebGL(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export function initHero(): void {
  const root = document.querySelector<HTMLElement>('[data-hero]');
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const stage = root.querySelector<HTMLElement>('.story-stage');
  const shade = root.querySelector<HTMLElement>('.story-shade');
  const canvas = root.querySelector<HTMLCanvasElement>('.story-canvas');
  if (!stage || !shade || !canvas) return;
  const caps = [...root.querySelectorAll<HTMLElement>('[data-from]')];

  root.classList.add('is-live');
  let hero: Hero | null = null;
  // 휠은 한 번에 100px씩 뛰어 장면이 뚝뚝 끊긴다(11/05) — 스크롤 위치는 목표로만 쓰고,
  // 화면에 쓰는 값은 매 프레임 목표를 부드럽게 따라간다(시간 상수 TAU, 프레임 수와 무관)
  const TAU = 110;
  const cur = { p: -1, q: 0 };
  let outroT = 0; // 0~1 시간 진행(정리 애니메이션), 화면에는 부드럽게 휜 값
  let running = false;
  let lastT = 0;

  const targets = () => {
    const vh = innerHeight;
    const y = scrollY - root.offsetTop;
    return {
      p: clamp(y / (vh * HERO_VH)),
      q: clamp((y - vh * (HERO_VH + HOLD_VH)) / vh),
    };
  };

  const apply = () => {
    hero?.setProgress(cur.p);
    hero?.setOutro(outroT * outroT * (3 - 2 * outroT));
    for (const c of caps) c.classList.toggle('on', cur.p >= Number(c.dataset.from) && cur.p < Number(c.dataset.to));
    shade.style.opacity = String(cur.q * 0.75);
    stage.style.transform = cur.q > 0 ? `translate3d(0, ${(-cur.q * innerHeight * PARALLAX).toFixed(1)}px, 0)` : '';
  };

  const step = (t: number) => {
    const goal = targets();
    const dt = lastT ? t - lastT : 0;
    const k = lastT ? 1 - Math.exp(-dt / TAU) : 1;
    lastT = t;
    let moving = false;
    // 정리: 카메라가 끝에 닿으면 1까지 시간으로, 다시 올라가면 0으로
    const outroGoal = cur.p >= OUTRO_AT ? 1 : 0;
    if (outroT !== outroGoal) {
      outroT = outroGoal ? Math.min(1, outroT + dt / OUTRO_IN_MS) : Math.max(0, outroT - dt / OUTRO_OUT_MS);
      moving = true;
    }
    for (const key of ['p', 'q'] as const) {
      const d = goal[key] - cur[key];
      if (cur[key] < 0 || Math.abs(d) < 0.0004) cur[key] = goal[key];
      else {
        cur[key] += d * k;
        moving = true;
      }
    }
    apply();
    if (moving) requestAnimationFrame(step);
    else {
      running = false;
      lastT = 0;
    }
  };
  const request = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(step);
  };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  request();

  if (!hasWebGL()) return;
  import('./scene.js')
    .then(({ createHero }) => {
      const css = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      hero = createHero(canvas, {
        palette: { dark: token('--color-bg', '#17191c'), light: token('--color-fg', '#e9ebe6'), accent: token('--color-accent', '#8c98ff') },
      });
      const instance = hero;
      new ResizeObserver(() => instance.resize(canvas.clientWidth, canvas.clientHeight)).observe(canvas);
      root.classList.add('is-3d');
      apply();
    })
    .catch(() => {
      // 3D를 못 띄우면 포스터 그대로
    });
}
