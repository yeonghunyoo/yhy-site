// 홈 연출(docs/01-frontend.md "홈"): 숫자 0부터 올리기, 밑줄·막대 채우기, 프로젝트 펼치기, 경력 라벨 배치,
// 글자로 그린 이름(포인터 둘레 밀어내기), 소개 문단 흐르기(Pretext, 지연 로드). React 없이 이 파일 하나.
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
  setupFlow(root);
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
    for (const li of list.querySelectorAll<HTMLElement>('.job')) {
      if (li.classList.contains('last')) li.style.right = '0';
      else li.style.left = `${Number(li.dataset.x) * 100}%`;
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

/* ---------- 소개 문단: 포인터 자리에 빈 원을 내고 글이 둘레로 흐른다(Pretext) ---------- */
function setupFlow(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>('[data-flow]');
  if (!box) return;
  const text = box.textContent!.trim();
  const unit = root.closest('[lang]')?.getAttribute('lang') === 'en' || root.dataset.locale === 'en' ? 'lines' : '줄';
  type Pretext = typeof import('@chenglou/pretext');
  let lib: Promise<Pretext> | null = null;
  const load = () => (lib ??= import('@chenglou/pretext'));
  // 화면에 보이면 쉬는 시간에 미리 받아 둔다(초기 JS에는 넣지 않는다)
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    ('requestIdleCallback' in window ? requestIdleCallback : setTimeout)(() => load().catch(() => {}));
  });
  io.observe(box);

  let ready: ((p: { x: number; y: number }) => void) | null = null;
  let mover: ((p: { x: number; y: number }) => void) | null = null;
  let closer: (() => void) | null = null;
  const enable = async () => {
    if (ready) return;
    const { prepareWithSegments, layoutNextLineRange, materializeLineRange } = await load();
    const cs = getComputedStyle(box);
    const LH = parseFloat(cs.lineHeight) || 26;
    const prepared = prepareWithSegments(text, `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, { wordBreak: 'keep-all' });
    const label = document.createElement('span');
    label.className = 'sr-only';
    label.textContent = text;
    const layer = document.createElement('span');
    layer.setAttribute('aria-hidden', 'true');
    const hole = document.createElement('span');
    hole.className = 'hole';
    hole.innerHTML = `<span><b>0</b>${unit}</span>`;
    box.textContent = '';
    box.append(label, layer);
    layer.append(hole);
    box.classList.add('flow');
    const pool: HTMLSpanElement[] = [];
    const cur = { x: 0, y: 0, r: 0 }, target = { x: 0, y: 0, r: 0 };
    const R = 46, MIN = 36;
    let width = box.clientWidth, baseRows = 0, raf = 0;
    const lay = () => {
      let cursor = { segmentIndex: 0, graphemeIndex: 0 };
      const lines: { x: number; y: number; text: string }[] = [];
      let row = 0;
      for (; row < 60; row++) {
        const top = row * LH, mid = top + LH / 2;
        let spans: [number, number][] = [[0, width]];
        if (cur.r > 4 && Math.abs(mid - cur.y) < cur.r + LH / 2) {
          const dy = Math.min(Math.abs(mid - cur.y), cur.r);
          const half = Math.sqrt(Math.max(0, (cur.r + 6) ** 2 - dy ** 2));
          spans = ([[0, cur.x - half], [cur.x + half, width]] as [number, number][]).filter(([a, b]) => b - a >= MIN);
        }
        let ended = false;
        for (const [a, b] of spans) {
          const range = layoutNextLineRange(prepared, b - a, cursor);
          if (!range) { ended = true; break; }
          lines.push({ x: a, y: top, text: materializeLineRange(prepared, range).text });
          cursor = range.end;
        }
        if (ended) { row++; break; }
      }
      return { lines, rows: row };
    };
    const draw = () => {
      const { lines, rows } = lay();
      if (!baseRows) baseRows = rows;
      box.style.height = `${Math.max(rows, baseRows) * LH}px`;
      while (pool.length < lines.length) { const s = document.createElement('span'); s.className = 'ln'; layer.append(s); pool.push(s); }
      pool.forEach((s, i) => {
        const l = lines[i];
        s.hidden = !l;
        if (!l) return;
        if (s.textContent !== l.text) s.textContent = l.text;
        s.style.transform = `translate(${l.x}px, ${l.y}px)`;
      });
      hole.style.width = hole.style.height = `${cur.r * 2}px`;
      hole.style.transform = `translate(${cur.x - cur.r}px, ${cur.y - cur.r}px)`;
      hole.querySelector('b')!.textContent = String(lines.length);
    };
    const tick = () => {
      const k = reduce ? 1 : 0.22;
      cur.x += (target.x - cur.x) * k; cur.y += (target.y - cur.y) * k; cur.r += (target.r - cur.r) * k;
      draw();
      raf = Math.abs(target.x - cur.x) + Math.abs(target.y - cur.y) + Math.abs(target.r - cur.r) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    ready = (p) => { Object.assign(target, p, { r: R }); if (cur.r < 1) Object.assign(cur, p); hole.classList.add('on'); kick(); };
    mover = (p) => { Object.assign(target, p); kick(); };
    closer = () => { target.r = 0; hole.classList.remove('on'); kick(); };
    new ResizeObserver(() => { if (box.clientWidth !== width) { width = box.clientWidth; baseRows = 0; draw(); } }).observe(box);
    draw();
  };

  const local = (x: number, y: number) => { const r = box.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
  let inside = false, hideT = 0;
  const open = async (p: { x: number; y: number }) => {
    // 첫 호버에 라이브러리를 아직 받는 중이면 진행 커서를 보인다
    if (!ready) box.classList.add('loading');
    try { await enable(); } catch { return; } finally { box.classList.remove('loading'); } // 못 받으면 평범한 문단으로 둔다
    if (inside) ready?.(p);
  };
  box.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; inside = true; open(local(e.clientX, e.clientY)); });
  box.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mover?.(local(e.clientX, e.clientY)); });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'mouse') return; inside = false; closer?.(); });
  tapPeek(box, {
    start: (x, y) => { clearTimeout(hideT); inside = true; open(local(x, y)); },
    end: () => { clearTimeout(hideT); hideT = window.setTimeout(() => { inside = false; closer?.(); }, 500); },
  });
}
