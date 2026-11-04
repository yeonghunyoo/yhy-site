// 프로젝트 상세 이미지(docs/01-frontend.md "프로젝트 상세 — 이미지"): 목록 슬라이드의 카운터·이전/다음 버튼과
// 전체 화면 뷰어(핀치·휠 확대, 끌어서 이동, 두 번 탭, 좌우 밀어 넘기기, 아래로 밀어 닫기). React 없이 이 파일 하나.
// 위치·배율은 프레임마다 CSSOM(style.transform)에 바로 쓴다 — HTML style="" 속성은 CSP로 막혀 있다.
import { lockScroll } from '../components/islands/scroll-lock';

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initGalleries(): void {
  document.querySelectorAll<HTMLElement>('[data-gallery]').forEach(setup);
}

function setup(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>('[data-track]');
  const dialog = root.querySelector<HTMLDialogElement>('[data-viewer]');
  if (!track || !dialog) return;
  const thumbs = [...track.querySelectorAll<HTMLButtonElement>('[data-open]')];
  const n = thumbs.length;

  // ── 목록: 지금 보이는 장 계산 → 카운터·버튼 ──────────────────────────────
  const count = root.querySelector<HTMLElement>('[data-count]');
  const prev = root.querySelector<HTMLButtonElement>('[data-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-next]');
  const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  const current = () => {
    if (atEnd()) return n - 1;
    let best = 0;
    let bestD = Infinity;
    thumbs.forEach((t, i) => {
      const d = Math.abs(t.offsetLeft - track.scrollLeft);
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best;
  };
  let frame = 0;
  const sync = () => {
    frame = 0;
    const i = current();
    if (count) count.textContent = String(i + 1);
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = atEnd();
  };
  track.addEventListener('scroll', () => (frame ||= requestAnimationFrame(sync)), { passive: true });
  sync();
  const scrollToThumb = (i: number, smooth: boolean) =>
    track.scrollTo({ left: thumbs[Math.max(0, Math.min(n - 1, i))].offsetLeft, behavior: smooth && !reduce() ? 'smooth' : 'auto' });
  prev?.addEventListener('click', () => scrollToThumb(current() - 1, true));
  next?.addEventListener('click', () => scrollToThumb(atEnd() ? n - 1 : current() + 1, true));

  // ── 뷰어 ────────────────────────────────────────────────────────────────
  const stage = dialog.querySelector<HTMLElement>('[data-stage]')!;
  const strip = dialog.querySelector<HTMLElement>('[data-strip]')!;
  const backdrop = dialog.querySelector<HTMLElement>('[data-backdrop]')!;
  const imgs = [...strip.querySelectorAll<HTMLImageElement>('img')];
  const vCount = dialog.querySelector<HTMLElement>('[data-viewer-count]');
  const vPrev = dialog.querySelector<HTMLButtonElement>('[data-viewer-prev]');
  const vNext = dialog.querySelector<HTMLButtonElement>('[data-viewer-next]');

  let index = 0;
  /** 현재 장의 배율·이동(화면 가운데 기준 px) */
  const v = { s: 1, x: 0, y: 0 };
  let unlock: (() => void) | null = null;
  let pushed = false;

  const size = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  /** 배율 1일 때 실제 그림이 차지하는 크기(object-contain) */
  const fitted = (img: HTMLImageElement) => {
    const { w, h } = size();
    const ar = (img.naturalWidth || img.width) / (img.naturalHeight || img.height) || 1;
    const fw = Math.min(w, h * ar);
    return { fw, fh: fw / ar };
  };
  const anim = (el: HTMLElement, on: boolean, ms = 280) => {
    el.style.transition = on && !reduce() ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}` : 'none';
  };

  const clamp = () => {
    const { w, h } = size();
    const { fw, fh } = fitted(imgs[index]);
    const mx = Math.max(0, (fw * v.s - w) / 2);
    const my = Math.max(0, (fh * v.s - h) / 2);
    v.x = Math.min(mx, Math.max(-mx, v.x));
    v.y = Math.min(my, Math.max(-my, v.y));
  };
  const applyZoom = () => {
    clamp();
    imgs[index].style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  };
  /** 화면 가운데 기준 (px, py)를 고정한 채 배율을 s로 */
  const zoomAt = (s: number, px: number, py: number) => {
    const ns = Math.min(MAX_ZOOM, Math.max(1, s));
    v.x = px - ((px - v.x) * ns) / v.s;
    v.y = py - ((py - v.y) * ns) / v.s;
    v.s = ns;
    applyZoom();
  };
  const resetZoom = (smooth: boolean) => {
    anim(imgs[index], smooth);
    v.s = 1;
    v.x = 0;
    v.y = 0;
    applyZoom();
  };
  const applyStrip = (dx = 0) => {
    strip.style.transform = `translate3d(${-index * size().w + dx}px, 0, 0)`;
  };

  /** 처음엔 목록에서 이미 받은 그림을 보여 주고, 큰 그림이 오면 바꾼다. 현재·양옆만 */
  const load = (i: number) => {
    const img = imgs[i];
    if (!img || img.dataset.loaded) return;
    img.dataset.loaded = '1';
    const small = thumbs[i].querySelector('img');
    if (small?.complete && small.currentSrc) img.src = small.currentSrc;
    const big = new Image();
    big.src = img.dataset.full!;
    big
      .decode()
      .then(() => (img.src = big.src))
      .catch(() => {});
  };

  const updateChrome = () => {
    if (vCount) vCount.textContent = String(index + 1);
    if (vPrev) vPrev.disabled = index === 0;
    if (vNext) vNext.disabled = index === n - 1;
  };

  const go = (i: number, smooth = true) => {
    const ni = Math.max(0, Math.min(n - 1, i));
    if (ni !== index) {
      resetZoom(false);
      index = ni;
    }
    [index - 1, index, index + 1].forEach(load);
    v.s = 1;
    v.x = 0;
    v.y = 0;
    anim(imgs[index], false);
    applyZoom();
    anim(strip, smooth);
    applyStrip();
    updateChrome();
  };

  const open = (i: number) => {
    if (dialog.open) return;
    // 히스토리를 먼저 쌓고 나서 스크롤을 잠근다 — 반대로 하면 이전 항목에 스크롤 0이 저장돼 뒤로 가기 때 맨 위로 튄다
    history.pushState({ ...(history.state ?? {}), gallery: true }, '');
    pushed = true;
    unlock = lockScroll();
    dialog.showModal();
    anim(backdrop, false);
    backdrop.style.opacity = '1';
    index = Math.max(0, Math.min(n - 1, i));
    imgs.forEach((img) => (img.style.transform = ''));
    go(index, false);
  };
  const close = () => {
    if (dialog.open) dialog.close();
  };

  thumbs.forEach((t, i) => t.addEventListener('click', () => open(i)));
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  vPrev?.addEventListener('click', () => go(index - 1));
  vNext?.addEventListener('click', () => go(index + 1));

  const onPop = () => {
    // 뒤로 가기(Android 등)로 닫힘 — 히스토리는 이미 빠졌다
    pushed = false;
    close();
  };
  window.addEventListener('popstate', onPop);

  // 닫기는 모두(Esc·버튼·뒤로 가기·아래로 밀기) 여기로 모인다
  dialog.addEventListener('close', () => {
    unlock?.();
    unlock = null;
    if (pushed) {
      pushed = false;
      history.back();
    }
    scrollToThumb(index, false);
    thumbs[index]?.focus({ preventScroll: true });
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === '+' || e.key === '=') (anim(imgs[index], true), zoomAt(v.s * 1.5, 0, 0));
    else if (e.key === '-') (anim(imgs[index], true), zoomAt(v.s / 1.5, 0, 0));
    else if (e.key === '0') resetZoom(true);
    else return;
    e.preventDefault();
  });

  addEventListener('resize', () => {
    if (!dialog.open) return;
    anim(strip, false);
    applyStrip();
    anim(imgs[index], false);
    applyZoom();
  });

  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      anim(imgs[index], false);
      zoomAt(v.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    },
    { passive: false },
  );

  // ── 손가락·마우스 ───────────────────────────────────────────────────────
  // 1개: 확대 중이면 이동, 아니면 방향을 보고 좌우 = 넘기기 / 아래 = 닫기. 2개: 핀치(두 손가락 가운데 고정)
  type Pt = { x: number; y: number };
  const pts = new Map<number, Pt>();
  let mode: 'none' | 'pan' | 'swipe' | 'dismiss' | 'pinch' = 'none';
  let start = { x: 0, y: 0, t: 0 };
  let pinch: { d: number; s: number; mx: number; my: number; x: number; y: number } | null = null;
  let moved = false;
  let tap: { t: number; x: number; y: number } | null = null;

  /** 화면 가운데 기준 좌표 */
  const local = (e: PointerEvent): Pt => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };
  const startPinch = () => {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: v.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: v.x, y: v.y };
  };
  const settleDismiss = () => {
    anim(imgs[index], true);
    anim(backdrop, true);
    backdrop.style.opacity = '1';
    applyZoom();
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      moved = false;
      mode = 'none';
      start = { ...p, t: performance.now() };
      anim(imgs[index], false);
      anim(strip, false);
    } else if (pts.size === 2) {
      // 넘기거나 닫던 중이면 제자리로 두고 핀치로
      if (mode === 'swipe') applyStrip();
      if (mode === 'dismiss') {
        backdrop.style.opacity = '1';
        v.y = 0;
      }
      mode = 'pinch';
      moved = true;
      startPinch();
    }
  });

  stage.addEventListener('pointermove', (e) => {
    const last = pts.get(e.pointerId);
    if (!last) return;
    const p = local(e);
    pts.set(e.pointerId, p);

    if (mode === 'pinch' && pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const ns = Math.min(MAX_ZOOM, Math.max(1, (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      v.x = mx - ((pinch.mx - pinch.x) * ns) / pinch.s;
      v.y = my - ((pinch.my - pinch.y) * ns) / pinch.s;
      v.s = ns;
      applyZoom();
      return;
    }
    if (pts.size !== 1) return;

    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (mode === 'none') {
      if (Math.hypot(dx, dy) < 8) return;
      moved = true;
      if (v.s > 1.01) mode = 'pan';
      else if (Math.abs(dx) > Math.abs(dy)) mode = n > 1 ? 'swipe' : 'none';
      else mode = dy > 0 ? 'dismiss' : 'none';
      if (mode === 'none') return;
    }
    if (mode === 'pan') {
      v.x += p.x - last.x;
      v.y += p.y - last.y;
      applyZoom();
    } else if (mode === 'swipe') {
      // 처음·끝에서는 저항
      const edge = (index === 0 && dx > 0) || (index === n - 1 && dx < 0);
      applyStrip(edge ? dx / 3 : dx);
    } else if (mode === 'dismiss') {
      const d = Math.max(0, dy);
      imgs[index].style.transform = `translate3d(${dx * 0.3}px, ${d}px, 0) scale(${1 - Math.min(d / size().h, 0.25)})`;
      backdrop.style.opacity = String(1 - Math.min(d / (size().h * 0.6), 0.8));
    }
  });

  const up = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    pts.delete(e.pointerId);
    if (pts.size === 1 && mode === 'pinch') {
      // 한 손가락만 남으면 이어서 이동
      const [rest] = [...pts.values()];
      start = { ...rest, t: performance.now() };
      pinch = null;
      mode = v.s > 1.01 ? 'pan' : 'none';
      return;
    }
    if (pts.size > 0) return;

    const dt = Math.max(1, performance.now() - start.t);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    const ended = mode;
    mode = 'none';
    pinch = null;
    if (e.type === 'pointercancel') {
      if (ended === 'swipe') go(index);
      if (ended === 'dismiss') settleDismiss();
      return;
    }

    if (ended === 'swipe') {
      const fast = Math.abs(dx) / dt > 0.4;
      const far = Math.abs(dx) > size().w * 0.18;
      go(fast || far ? index + (dx < 0 ? 1 : -1) : index);
      return;
    }
    if (ended === 'dismiss') {
      if (dy > 120 || dy / dt > 0.5) {
        // 내려가며 사라진 뒤 닫는다
        anim(backdrop, true, 160);
        anim(imgs[index], true, 160);
        backdrop.style.opacity = '0';
        imgs[index].style.transform = `translate3d(${dx * 0.3}px, ${size().h}px, 0) scale(0.75)`;
        setTimeout(close, reduce() ? 0 : 160);
      } else settleDismiss();
      return;
    }
    if (ended === 'pinch' && v.s < 1.02) resetZoom(true);
    if (moved) return;

    // 탭: 두 번 탭 = 맞춤 ↔ 2.5배. 마우스로 그림 바깥을 누르면 닫기
    const now = performance.now();
    if (tap && now - tap.t < 300 && Math.hypot(p.x - tap.x, p.y - tap.y) < 30) {
      tap = null;
      anim(imgs[index], true);
      if (v.s > 1.05) resetZoom(true);
      else zoomAt(DOUBLE_TAP_ZOOM, p.x, p.y);
      return;
    }
    tap = { t: now, ...p };
    if (e.pointerType === 'mouse') {
      const { fw, fh } = fitted(imgs[index]);
      const outside = Math.abs(p.x - v.x) > (fw * v.s) / 2 || Math.abs(p.y - v.y) > (fh * v.s) / 2;
      if (outside) close();
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
}
