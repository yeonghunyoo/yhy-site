// 블로그 자리표시 컴포넌트(docs/08-blog.md "자리표시 컴포넌트", S-019) — 글을 기호로 덮었다가 앞에서부터 풀어 보여 준다.
// 글은 props.text, 없으면 대체 글. 원문은 처음부터 HTML에 있고(검색·스크린 리더), 움직임 줄이기면 하지 않는다.
const CHARS = '!#$%&*+-/:;<=>?@[]^_|~01';
const DURATION_MS = 1400;

export function mount(el: HTMLElement, props: { text?: string }): void {
  const fallback = el.querySelector<HTMLElement>('.blog-embed-fallback');
  const text = (props.text || fallback?.textContent || '').trim();
  if (!text || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const out = document.createElement('p');
  out.className = 'blog-embed-scramble';
  out.setAttribute('aria-label', text);
  fallback?.classList.add('sr-only');
  el.appendChild(out);
  el.classList.add('is-live');

  const chars = [...text];
  const order = chars.map((_, i) => i / chars.length); // 앞에서부터 풀린다
  let start = 0;
  const frame = (t: number) => {
    if (!start) start = t;
    const k = Math.min(1, (t - start) / DURATION_MS);
    out.textContent = chars
      .map((c, i) => (c.trim() === '' || order[i] < k ? c : CHARS[Math.floor(Math.random() * CHARS.length)]))
      .join('');
    if (k < 1) requestAnimationFrame(frame);
  };
  new IntersectionObserver(
    ([e], io) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      requestAnimationFrame(frame);
    },
    { threshold: 0.5 },
  ).observe(el);
  out.textContent = chars.map((c) => (c.trim() === '' ? c : CHARS[0])).join('');
}
