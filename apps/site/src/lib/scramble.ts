// 해독 타이포그래피 — [data-scramble] 안의 글이 화면에 들어오면 ASCII 기호로 덮였다가 앞에서부터 순서대로 원래 글로 풀린다.
// 11/05 프로토타입에서 만들고 "정신없다"는 의견으로 적용은 뺐다. 모듈만 남겨 둔다(어디서도 부르지 않음).
//
// 쓰려면: 요소에 data-scramble, 페이지 스크립트에서 initScramble(), 전역 CSS에 아래를 더한다.
//   .scr-ch { position: relative; }
//   .scr-ch.enc { color: transparent; }
//   .scr-ch.enc::after { content: attr(data-c); position: absolute; inset: 0; display: flex; align-items: center;
//     justify-content: center; color: var(--color-muted); font-family: var(--font-mono); font-weight: 400; font-size: 0.82em; }
//
// 원래 글자를 투명하게 자리에 두고 그 위에 기호를 겹쳐 그려서 폭·줄바꿈이 바뀌지 않는다(레이아웃 재계산 없음).
// 움직임 줄이기면 하지 않는다. 해독 중에는 aria-label로 원문을 준다. 글은 처음부터 HTML에 있다.

const CHARS = '!#$%&*+-/:;<=>?@[]\\^_|~01';

export interface ScrambleOptions {
  /** 처음에 전부 기호인 채로 머무는 시간(ms) */
  hold?: number;
  /** 문단 하나가 풀리는 데 걸리는 대략의 시간(ms) — 글자 간격은 [minStep, maxStep]로 묶인다 */
  duration?: number;
  minStep?: number;
  maxStep?: number;
  /** 화면에 이만큼 들어오면 시작 */
  threshold?: number;
}

const rand = () => CHARS[(Math.random() * CHARS.length) | 0];

function wrap(el: HTMLElement) {
  const spans: HTMLSpanElement[] = [];
  const restore: { holder: HTMLSpanElement; text: string }[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walk.nextNode()) if (walk.currentNode.nodeValue?.trim()) nodes.push(walk.currentNode as Text);
  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const holder = document.createElement('span');
    for (const ch of text) {
      if (/\s/.test(ch)) {
        holder.appendChild(document.createTextNode(ch));
        continue;
      }
      const s = document.createElement('span');
      s.className = 'scr-ch enc';
      s.textContent = ch;
      s.dataset.c = rand();
      spans.push(s);
      holder.appendChild(s);
    }
    node.replaceWith(holder);
    restore.push({ holder, text });
  }
  return { spans, restore };
}

function run(el: HTMLElement, o: Required<ScrambleOptions>) {
  const original = el.textContent ?? '';
  const { spans, restore } = wrap(el);
  el.setAttribute('aria-label', original);
  const start = performance.now() + o.hold;
  const step = Math.min(o.maxStep, Math.max(o.minStep, o.duration / Math.max(1, spans.length)));
  let last = 0;
  let next = 0;
  const tick = (now: number) => {
    const upto = Math.min(spans.length, Math.max(0, Math.floor((now - start) / step)));
    for (; next < upto; next++) spans[next].classList.remove('enc');
    if (now - last > 40) {
      last = now;
      for (let i = next; i < spans.length; i++) spans[i].dataset.c = rand();
    }
    if (next < spans.length) {
      requestAnimationFrame(tick);
      return;
    }
    for (const r of restore) r.holder.replaceWith(r.text);
    el.removeAttribute('aria-label');
  };
  requestAnimationFrame(tick);
}

export function initScramble(options: ScrambleOptions = {}): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const o: Required<ScrambleOptions> = { hold: 500, duration: 1800, minStep: 35, maxStep: 70, threshold: 0.6, ...options };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        run(e.target as HTMLElement, o);
      }
    },
    { threshold: o.threshold },
  );
  document.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el) => io.observe(el));
}
