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
/** 눈 숫자(0·1)가 바뀌는 박자(11/05) — 히어로가 화면에 있고 탭이 보일 때만 돈다 */
const EYE_TICK_MS = 1000 / 12;

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

  // 본문 스냅(11/05): 정리가 끝나 마지막 문구만 남은 뒤 아래로 조금이라도 내리면, 본문 첫 섹션(#about)까지
  // 부드럽게 자동으로 올린다 — 커튼 구간을 손으로 끝까지 밀지 않아도 내용에 닿게. 위로 올릴 때는 하지 않는다.
  // 11/06: 임계점을 넘으면 스냅이 끝날 때까지 입력을 잠근다(터치·휠·스크롤 키·탭). 손가락 스크롤·관성이
  // 자동 스크롤과 같이 먹어 버벅였다 — 브라우저의 부드러운 스크롤 대신 직접 rAF로 움직이고, 그동안 입력을 막는다.
  // 이미 시작된 손가락 끌기는 JS로 취소되지 않는다(Chrome: 스크롤이 시작된 뒤 touchmove는 cancelable=false) —
  // 그래서 손가락이 닿아 있으면 잠근 채로 기다렸다가 떼는 순간 스냅한다(관성은 scrollTo가 끊는다). 잠금은
  // 애니메이션이 끝나고 손가락도 다 떨어져야 푼다 — 잠금 중에 새로 닿은 손가락이 풀린 뒤 스크롤로 이어지지 않게
  const about = document.getElementById('about');
  const html = document.documentElement;
  let lastY = scrollY;
  let snapping = false;
  let touching = false;
  let onRelease: (() => void) | null = null;
  const track = (e: TouchEvent) => {
    touching = e.touches.length > 0;
    if (!touching && onRelease) {
      const fn = onRelease;
      onRelease = null;
      fn();
    }
  };
  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) addEventListener(type, track, { passive: true, capture: true });
  const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar']);
  const block = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };
  const blockKey = (e: KeyboardEvent) => {
    if (SCROLL_KEYS.has(e.key) && !(e.target as Element | null)?.closest?.('input, textarea, [contenteditable]')) block(e);
  };
  const lock = (on: boolean) => {
    // 클래스: 터치 기기는 문서 스크롤 자체를 끈다(진행 중인 손가락 스크롤·관성까지 멈춤), 모든 기기에서 탭·클릭 막음 — global.css
    html.classList.toggle('is-snap-lock', on);
    const opts = { passive: false, capture: true } as const;
    for (const type of ['wheel', 'touchstart', 'touchmove'] as const) {
      if (on) addEventListener(type, block, opts);
      else removeEventListener(type, block, opts);
    }
    if (on) addEventListener('keydown', blockKey, true);
    else removeEventListener('keydown', blockKey, true);
  };
  const ease = (t: number) => 1 - (1 - t) ** 3; // 손가락 속도를 이어받듯 빠르게 출발해 천천히 닿는다
  const snap = () => {
    const y = scrollY;
    const down = y > lastY;
    lastY = y;
    if (!about || snapping || !down || outroT < 1) return;
    const start = root.offsetTop + innerHeight * HERO_VH * OUTRO_AT;
    const pad = parseFloat(getComputedStyle(html).scrollPaddingTop) || 0;
    const goal = about.getBoundingClientRect().top + y - pad;
    if (y < start || y >= goal - 8) return;
    snapping = true;
    lock(true);
    const finish = () => {
      if (touching) {
        onRelease = finish;
        return;
      }
      lock(false);
      snapping = false;
      lastY = scrollY;
    };
    const run = () => {
      const from = scrollY;
      if (from >= goal - 8) return finish(); // 손가락으로 이미 본문까지 내렸다
      const ms = Math.min(900, Math.max(450, ((goal - from) / innerHeight) * 450));
      let t0 = 0;
      const frame = (t: number) => {
        if (!t0) t0 = t;
        const k = Math.min(1, (t - t0) / ms);
        scrollTo({ top: from + (goal - from) * ease(k), behavior: 'instant' });
        if (k < 1) requestAnimationFrame(frame);
        else finish();
      };
      requestAnimationFrame(frame);
    };
    if (touching) onRelease = run;
    else run();
  };
  addEventListener('scroll', snap, { passive: true });
  addEventListener('resize', request);
  request();

  // 눈 숫자: 스크롤과 따로, 정해진 박자로 계속 다시 뽑는다. 히어로가 화면 밖이거나 탭이 숨으면 멈춘다
  const startEyes = (h: Hero) => {
    let visible = false;
    let last = 0;
    let tick = 0;
    let loop = 0;
    const frame = (t: number) => {
      loop = 0;
      if (!visible || document.hidden) return;
      if (t - last >= EYE_TICK_MS && outroT < 1) {
        last = t;
        tick = (tick + 1) % 4096;
        h.setTick(tick);
      }
      loop = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!loop && visible && !document.hidden) loop = requestAnimationFrame(frame);
    };
    new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      kick();
    }).observe(stage);
    document.addEventListener('visibilitychange', kick);
  };

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
      startEyes(instance);
    })
    .catch(() => {
      // 3D를 못 띄우면 포스터 그대로
    });
}
