// 홈 연출(docs/01-frontend.md "홈"): 숫자 0부터 올리기, 밑줄·막대 채우기, 프로젝트 펼치기, 경력 라벨 배치,
// 글자로 그린 이름(포인터 둘레 밀어내기). React 없이 이 파일 하나.
import { tapPeek } from './tap-peek';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const html = document.documentElement;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function months(n: number, locale: string): string {
  const y = Math.floor(n / 12), m = n % 12;
  if (locale === 'ko') return [y ? `${y}년` : '', m ? `${m}개월` : ''].filter(Boolean).join(' ') || '0개월';
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
}

export function initHome(): void {
  const root = document.querySelector<HTMLElement>('.home');
  if (!root) return;
  const locale = root.dataset.locale ?? 'ko';
  if (!reduce) html.classList.add('motion');

  setupCounters(root, locale);
  setupProjects(root);
  setupCareer(root);
  setupAscii(root);
}

/* ---------- 숫자·밑줄·막대: 화면에 들어올 때 한 번 ---------- */
function setupCounters(root: HTMLElement, locale: string) {
  const count = (el: HTMLElement) => {
    const isM = el.dataset.months != null;
    const to = Number(isM ? el.dataset.months : el.dataset.to);
    const show = (v: number) => (el.textContent = isM ? months(Math.round(v), locale) : Math.round(v).toLocaleString('en-US'));
    if (reduce) return show(to);
    const dur = Math.min(1600, 700 + Math.log10(to + 1) * 350);
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      show(to * ease(p));
      if (p < 1) requestAnimationFrame(tick);
    };
    show(0);
    requestAnimationFrame(tick);
  };
  const nums = [...root.querySelectorAll<HTMLElement>('[data-to],[data-months]')];
  const lines = [...root.querySelectorAll<HTMLElement | SVGElement>('.ul,.bar')];
  if (!reduce) for (const el of nums) el.textContent = el.dataset.months != null ? months(0, locale) : '0';
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        if ((e.target as HTMLElement).dataset.to != null || (e.target as HTMLElement).dataset.months != null) count(e.target as HTMLElement);
        else e.target.classList.add('in');
      }),
    { threshold: 0.3 },
  );
  [...nums, ...lines].forEach((el) => io.observe(el));
}

/* ---------- 프로젝트: 누르면 선택 핸들 + 설명 ---------- */
function setupProjects(root: HTMLElement) {
  const objs = [...root.querySelectorAll<HTMLElement>('.obj')];
  for (const obj of objs) {
    const head = obj.querySelector<HTMLButtonElement>('.obj-head')!;
    const more = obj.querySelector<HTMLElement>('.more')!;
    head.addEventListener('click', () => {
      const open = !obj.classList.contains('on');
      for (const o of objs) {
        o.classList.remove('on');
        o.querySelector('.obj-head')!.setAttribute('aria-expanded', 'false');
        o.querySelector<HTMLElement>('.more')!.hidden = true;
      }
      if (!open) return;
      obj.classList.add('on');
      head.setAttribute('aria-expanded', 'true');
      more.hidden = false;
    });
  }
}

/* ---------- 경력: 라벨을 막대 위 자기 구간 시작점에. 가운데는 위로 띄우고 지시선 ---------- */
function setupCareer(root: HTMLElement) {
  const list = root.querySelector<HTMLElement>('.jobs');
  if (!list) return;
  const place = () => {
    html.classList.add('placed');
    const W = list.clientWidth;
    for (const li of list.querySelectorAll<HTMLElement>('.job')) {
      li.style.removeProperty('--lx');
      if (li.classList.contains('last')) { li.style.right = '0'; continue; }
      const x = Number(li.dataset.x) * W;
      li.style.left = `${x}px`;
      // 오른쪽 끝을 넘으면 안쪽으로 당기고, 지시선은 자기 구간 시작점을 계속 가리킨다
      if (x + li.offsetWidth > W) {
        const left = Math.max(0, W - li.offsetWidth);
        li.style.left = `${left}px`;
        li.style.setProperty('--lx', `${x - left}px`);
      }
    }
    for (const li of list.querySelectorAll<HTMLElement>('.job')) {
      li.style.setProperty('--lead', `${Math.max(0, list.clientHeight - (li.offsetTop + li.offsetHeight))}px`);
    }
  };
  place();
  new ResizeObserver(place).observe(list);
}

/* ---------- 이름을 글자로 그린 그림 + 포인터 둘레 밀어내기 ---------- */
const RAMP = ' .:-=+*#%@';
const NOISE = '01/\\<>{}[]=+*#yh';

function setupAscii(root: HTMLElement) {
  const pre = root.querySelector<HTMLElement>('.ascii');
  const box = root.querySelector<HTMLElement>('.name-box');
  const name = root.querySelector<HTMLElement>('.name')?.textContent?.trim();
  if (!pre || !box || !name) return;
  let cells: { ch: string; at: number }[] = [];
  let cols = 0;
  let rows = 0;
  const push = { x: 0, y: 0, r: 0 };
  const pushTo = { x: 0, y: 0, r: 0 };

  const build = async () => {
    const font = getComputedStyle(root.querySelector('.name')!).fontFamily;
    try {
      await document.fonts.load(`400 200px ${font}`, name);
    } catch {}
    cols = box.clientWidth >= 500 ? 72 : 44;
    rows = Math.round(cols * 0.36);
    const S = 8;
    const cv = document.createElement('canvas');
    cv.width = cols * S;
    cv.height = rows * S * 2;
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.fillStyle = '#000';
    let size = cv.height * 1.1;
    g.font = `400 ${size}px ${font}`;
    size *= (cv.width * 0.98) / g.measureText(name).width;
    g.font = `400 ${size}px ${font}`;
    const m = g.measureText(name);
    const top = m.actualBoundingBoxAscent;
    const scaleY = Math.min(1, cv.height / (top + m.actualBoundingBoxDescent));
    g.save();
    g.scale(1, scaleY);
    g.fillText(name, cv.width * 0.01, top);
    g.restore();
    const data = g.getImageData(0, 0, cv.width, cv.height).data;
    const cw = cv.width / cols;
    const ch = cv.height / rows;
    cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let on = 0, n = 0;
        for (let y = Math.floor(r * ch); y < (r + 1) * ch; y += 2)
          for (let x = Math.floor(c * cw); x < (c + 1) * cw; x += 2) {
            n++;
            if (data[(y * cv.width + x) * 4 + 3] > 120) on++;
          }
        const v = on / n;
        cells.push({ ch: v < 0.04 ? ' ' : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(v * (RAMP.length - 1)))], at: 0 });
      }
    html.classList.add('ascii-on');
    const t0 = performance.now();
    cells.forEach((cell, i) => (cell.at = reduce ? 0 : t0 + 250 + ((i % cols) / cols) * 900 + Math.random() * 350));
    const loop = (now: number) => {
      paint(now);
      if (!reduce && now < t0 + 1600) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };

  const rnd = () => NOISE[Math.floor(Math.random() * NOISE.length)];
  const esc = (c: string) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c);
  /* 거리 d → d < R 이면 R + 0.35d, R ≤ d < 2R 이면 d + 0.35(2R − d): 원 안이 비고 글자는 바깥 띠로 밀린다 */
  function paint(now: number) {
    if (!cells.length) return;
    const n = rows * cols;
    const outCh: string[] = new Array(n).fill(' ');
    const outHot = new Uint8Array(n);
    const rank = new Int8Array(n).fill(-1);
    const w = pre!.clientWidth / cols, hgt = pre!.clientHeight / rows, R = push.r;
    const put = (i: number, c: string, hot: number) => {
      const k = RAMP.indexOf(c);
      if (k > rank[i]) { rank[i] = k; outCh[i] = c; outHot[i] = hot; }
    };
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, cell = cells[i];
        if (cell.ch === ' ') continue;
        if (now < cell.at) { outCh[i] = rnd(); outHot[i] = 1; rank[i] = 99; continue; }
        if (R < 1) { put(i, cell.ch, 0); continue; }
        const dx = (c + 0.5) * w - push.x, dy = (r + 0.5) * hgt - push.y, d = Math.hypot(dx, dy);
        if (d >= 2 * R) { put(i, cell.ch, 0); continue; }
        const nd = d < R ? R + 0.35 * d : d + 0.35 * (2 * R - d);
        const ux = d ? dx / d : 1, uy = d ? dy / d : 0;
        const tc = Math.floor((push.x + ux * nd) / w), tr = Math.floor((push.y + uy * nd) / hgt);
        if (tc >= 0 && tc < cols && tr >= 0 && tr < rows) put(tr * cols + tc, cell.ch, d < R ? 1 : 0);
      }
    let out = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) { const i = r * cols + c; out += outHot[i] ? `<span class="hot">${esc(outCh[i])}</span>` : esc(outCh[i]); }
      out += '\n';
    }
    pre!.innerHTML = out;
  }

  let raf = 0;
  const step = (now: number) => {
    const k = reduce ? 1 : 0.2;
    push.x += (pushTo.x - push.x) * k; push.y += (pushTo.y - push.y) * k; push.r += (pushTo.r - push.r) * k;
    paint(now);
    raf = Math.abs(pushTo.x - push.x) + Math.abs(pushTo.y - push.y) + Math.abs(pushTo.r - push.r) > 0.3 ? requestAnimationFrame(step) : 0;
  };
  const kick = () => { if (!raf && cells.length) raf = requestAnimationFrame(step); };
  const at = (x: number, y: number) => {
    const r = pre.getBoundingClientRect();
    const p = { x: x - r.left, y: y - r.top };
    if (push.r < 1 && pushTo.r < 1) Object.assign(push, p);
    Object.assign(pushTo, p, { r: Math.max(72, (r.width / cols) * 11) });
    kick();
  };
  const off = () => { pushTo.r = 0; kick(); };
  pre.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') at(e.clientX, e.clientY); });
  pre.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') off(); });
  tapPeek(pre, { start: at, end: off });

  build();
  let width = box.clientWidth, timer = 0;
  new ResizeObserver(() => {
    if (box.clientWidth === width) return;
    width = box.clientWidth;
    clearTimeout(timer);
    timer = window.setTimeout(build, 200);
  }).observe(box);
}
