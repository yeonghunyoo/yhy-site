// 블로그 글 변환(docs/08-blog.md "동기화" 3·5): Notion식 마크다운(API `GET /v1/pages/{id}/markdown`, v2) → 정리된 HTML.
// 동기화(scripts/blog-sync.mjs)와 확인(scripts/blog-check.mjs)이 같이 쓴다. 이미지는 resolveImage 콜백이 우리 주소로 바꾼다.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import rehypeHighlight from 'rehype-highlight';
import { readFileSync } from 'node:fs';

/** 자리표시 컴포넌트 허용 목록(S-019) — 사이트의 src/components/blog/components.json과 같은 파일 */
export const COMPONENTS = JSON.parse(readFileSync(new URL('../../src/components/blog/components.json', import.meta.url), 'utf8'));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Notion 전용 태그를 표준 마크다운·HTML로. 모르는 태그는 지우고 warnings에 남긴다.
 * HTML 블록 안의 마크다운이 다시 읽히도록 여는·닫는 태그 앞뒤에 빈 줄을 둔다(CommonMark HTML 블록 규칙).
 */
export function normalizeNotionMarkdown(md) {
  const warnings = [];
  let s = md.replace(/\r\n/g, '\n');

  // 못 읽은 블록이 있으면 글이 잘린 것 — 호출한 쪽이 그 글을 건너뛴다
  if (/<unknown\b/.test(s)) warnings.push({ fatal: true, msg: '못 읽은 블록(<unknown>)이 있다' });

  // 자리표시 컴포넌트(S-019): 코드 블록 첫 줄 `@component 이름 {JSON}`, 둘째 줄부터 대체 글.
  // 허용 목록에 있고 설정이 작은 JSON 객체(값은 글자·숫자·참거짓)면 빈 자리 + 대체 글, 아니면 대체 글만
  s = s.replace(/```[^\n]*\n@component[ \t]+([^\s{]+)[ \t]*(\{[^\n]*\})?[ \t]*\n([\s\S]*?)```/g, (_, name, json = '', rest) => {
    const fallback = rest.trim().replace(/\s*\n\s*/g, ' ');
    const para = fallback ? `<p class="blog-embed-fallback">${esc(fallback)}</p>` : '';
    let props = {};
    try {
      props = json ? JSON.parse(json) : {};
    } catch {
      warnings.push({ fatal: false, msg: `@component ${name}: 설정이 JSON이 아니다 — 대체 글만` });
      return `\n\n${para}\n\n`;
    }
    const ok = props && typeof props === 'object' && !Array.isArray(props) && json.length <= 2048 && Object.values(props).every((v) => ['string', 'number', 'boolean'].includes(typeof v));
    if (!COMPONENTS[name] || !ok) {
      warnings.push({ fatal: false, msg: `@component ${name}: ${COMPONENTS[name] ? '설정이 작은 JSON 객체가 아니다' : '허용 목록(components.json)에 없다'} — 대체 글만` });
      return `\n\n${para}\n\n`;
    }
    for (const k of Object.keys(props)) if (!COMPONENTS[name].props?.[k]) warnings.push({ fatal: false, msg: `@component ${name}: 모르는 설정 "${k}"` });
    return `\n\n<div class="blog-embed" data-blog-component="${name}" data-props="${esc(JSON.stringify(props))}">${para}</div>\n\n`;
  });

  // 그림: <image source="…">캡션</image> → figure. src는 원래 주소(나중에 resolveImage가 바꾼다)
  s = s.replace(/<image\s+source="([^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/image>)/g, (_, src, cap = '') => {
    const caption = cap.replace(/<[^>]+>/g, '').trim();
    return `\n\n<figure><img src="${esc(src)}" alt="${esc(caption)}" />${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>\n\n`;
  });
  // 그림(마크다운형): 한 줄짜리 ![캡션](주소)도 <image>와 같게 figure + 캡션
  s = s.replace(/^!\[([^\]]*)\]\(([^)\s]+)\)[ \t]*$/gm, (_, cap, src) => `\n\n<figure><img src="${esc(src)}" alt="${esc(cap.trim())}" />${cap.trim() ? `<figcaption>${esc(cap.trim())}</figcaption>` : ''}</figure>\n\n`);
  // 북마크·임베드·바깥 동영상 → 링크 한 줄(바깥 주소일 때만). Notion에 올린 파일은 주소가 1시간 뒤 만료라 아래에서 뺀다
  const notionFile = (u) => /amazonaws\.com|notion-static\.com|file\.notion\.so|notion-file-block:/.test(u);
  s = s.replace(/<(bookmark|embed|video)\b[^>]*?source="(https:\/\/[^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g, (m, tag, url, cap = '') => {
    if (notionFile(url)) return m;
    const label = cap.replace(/<[^>]+>/g, '').trim() || url.replace(/^https:\/\//, '');
    return `\n\n<p><a href="${esc(url)}">${esc(label)} ↗</a></p>\n\n`;
  });

  // 코드 탭(S-020): Notion 탭 블록 → 탭마다 이름표 + 내용. 탭이 여럿이면 전환(code-tabs), 하나면 파일명 이름표(code-file)
  s = s.replace(/<tabs\b[^>]*>([\s\S]*?)<\/tabs>/g, (_, inner) => {
    const tabs = [...inner.matchAll(/<tab\b[^>]*>[ \t]*\n?([^\n]*)\n([\s\S]*?)<\/tab>/g)].map((m) => ({ label: m[1].replace(/<[^>]+>/g, '').trim(), body: m[2].trim() }));
    if (!tabs.length) return '\n\n';
    const kind = tabs.length > 1 ? 'code-tabs' : 'code-file';
    const panes = tabs.map((t) => `<div class="code-tab" data-label="${esc(t.label)}">\n\n<p class="code-label">${esc(t.label)}</p>\n\n${t.body}\n\n</div>`);
    return `\n\n<div class="${kind}">\n\n${panes.join('\n\n')}\n\n</div>\n\n`;
  });
  // 단계(S-020, Clerk식): 2열 블록에서 왼쪽은 글, 오른쪽에 코드가 있으면 한 단계. 이어진 단계는 렌더에서 묶고 번호를 붙인다.
  // 코드가 없는 2열 블록은 차례로 펼친다
  const hasCode = (t) => /```|class="code-(tabs|file)"/.test(t);
  s = s.replace(/<columns\b[^>]*>([\s\S]*?)<\/columns>/g, (_, inner) => {
    const cols = [...inner.matchAll(/<column\b[^>]*>([\s\S]*?)<\/column>/g)].map((m) => m[1].trim());
    if (cols.length === 2 && !hasCode(cols[0]) && hasCode(cols[1])) {
      return `\n\n<div class="blog-step">\n\n<div class="blog-step-text">\n\n${cols[0]}\n\n</div>\n\n<div class="blog-step-code">\n\n${cols[1]}\n\n</div>\n\n</div>\n\n`;
    }
    return `\n\n${cols.join('\n\n')}\n\n`;
  });
  // 콜아웃 → 인용 상자, 인용(태그형) → blockquote
  s = s.replace(/<callout\b[^>]*>/g, '\n\n<aside class="callout">\n\n').replace(/<\/callout>/g, '\n\n</aside>\n\n');
  s = s.replace(/<quote\b[^>]*>/g, '\n\n<blockquote>\n\n').replace(/<\/quote>/g, '\n\n</blockquote>\n\n');
  // 토글(태그형): 첫 줄이 제목, 빈 줄 뒤가 내용 → details
  s = s.replace(/<toggle\b[^>]*>[ \t]*\n?([^\n]*)\n?([\s\S]*?)<\/toggle>/g, (_, title, body) => `\n\n<details>\n<summary>${title.trim()}</summary>\n\n${body.trim()}\n\n</details>\n\n`);
  // 동기화 블록은 내용만, 링크 미리보기는 링크로, 날짜는 글자로
  s = s.replace(/<\/?synced-block(?:-reference)?\b[^>]*>/g, '\n\n');
  s = s.replace(/<link-preview\b[^>]*url="([^"]+)"[^>]*\/>/g, '<$1>');
  s = s.replace(/<date\b[^>]*start="([^"]+)"[^>]*\/>/g, '$1');
  // 토글은 HTML details 그대로(허용 태그)
  s = s.replace(/<details\b[^>]*>/g, '\n\n<details>\n\n').replace(/<\/details>/g, '\n\n</details>\n\n');
  s = s.replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g, '<summary>$1</summary>\n\n');
  // 빈 문단·빈 블록·목차 블록
  s = s.replace(/<p\s*\/>/g, '\n').replace(/<empty-block\s*\/>/g, '\n').replace(/<table[_-]of[_-]contents\b[^>]*\/>/g, '');
  // 다른 페이지·DB·멘션은 글자만(링크는 비공개 Notion 주소라 내보내지 않는다)
  s = s.replace(/<(mention(?:-[a-z-]+)?|page|database|folder)\b[^>]*>([\s\S]*?)<\/\1>/g, '$2').replace(/<(mention(?:-[a-z-]+)?|page|database|folder)\b[^>]*\/>/g, '');
  // 글자 색·배경색은 버린다(CSP: style 금지, 사이트 색은 토큰으로)
  s = s.replace(/<span\b[^>]*>([\s\S]*?)<\/span>/g, '$1').replace(/\s*\{color="[^"]*"\}/g, '');
  // 지원하지 않는 미디어(동영상·파일·PDF·오디오·임베드·북마크)
  s = s.replace(/<(video|file|pdf|audio|embed|bookmark)\b[^>]*?(?:\/>|>[\s\S]*?<\/\1>)/g, (m, tag) => {
    warnings.push({ fatal: false, msg: `지원하지 않는 블록 <${tag}>을 뺐다` });
    return '';
  });
  return { markdown: s.replace(/\n{3,}/g, '\n\n').trim() + '\n', warnings };
}

// 허용 태그·속성(CSP: style·on* 없음). 이미지는 우리 경로만(resolveImage가 바꾼 뒤라 /blog/img/)
const schema = {
  ...defaultSchema,
  clobberPrefix: '',
  tagNames: [...defaultSchema.tagNames, 'figure', 'figcaption', 'aside', 'details', 'summary', 'u'],
  attributes: {
    ...defaultSchema.attributes,
    '*': (defaultSchema.attributes['*'] ?? []).filter((a) => a !== 'style'),
    h2: ['id'], h3: ['id'], h4: ['id'],
    aside: [['className', 'callout']],
    div: [['className', 'blog-embed', 'blog-steps', 'blog-step', 'blog-step-text', 'blog-step-code', 'code-tabs', 'code-file', 'code-tab'], 'dataBlogComponent', 'dataProps', 'dataLabel'],
    p: [['className', 'blog-embed-fallback', 'code-label']],
    img: ['src', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchPriority'],
    a: ['href', 'title', 'rel', 'target'],
    code: [['className', /^language-./]],
  },
  protocols: { ...defaultSchema.protocols, src: ['https'] },
};

/** hast 순회 */
function walk(node, fn, parent) {
  fn(node, parent);
  for (const c of node.children ?? []) walk(c, fn, node);
}
const textOf = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(textOf).join(''));

/**
 * 마크다운 → HTML. resolveImage(src, alt) → { url, width, height } | null(그림을 뺀다).
 * 돌려주는 것: html, toc(h2·h3), images(바뀐 이미지 정보), warnings
 */
export async function renderPost(notionMarkdown, { resolveImage }) {
  const { markdown, warnings } = normalizeNotionMarkdown(notionMarkdown);
  const images = [];
  const toc = [];

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // 제목 단계: 페이지 h1은 글 제목이라 본문은 h2부터 — 가장 높은 단계를 h2로 맞춰 내린다(건너뛰기 없음)
    .use(() => (tree) => {
      let min = 7;
      walk(tree, (n) => n.type === 'element' && /^h[1-6]$/.test(n.tagName) && (min = Math.min(min, Number(n.tagName[1]))));
      const shift = min < 7 ? 2 - min : 0;
      walk(tree, (n) => {
        if (n.type === 'element' && /^h[1-6]$/.test(n.tagName)) n.tagName = `h${Math.min(6, Number(n.tagName[1]) + shift)}`;
      });
    })
    // 이미지: 원래 주소 → 우리 주소(내려받기·webp·R2는 resolveImage가 한다)
    .use(() => async (tree) => {
      const imgs = [];
      walk(tree, (n, parent) => n.type === 'element' && n.tagName === 'img' && imgs.push([n, parent]));
      for (const [n, parent] of imgs) {
        const src = String(n.properties.src ?? '');
        const alt = String(n.properties.alt ?? '');
        const r = src ? await resolveImage(src, alt) : null;
        if (!r) {
          warnings.push({ fatal: false, msg: `이미지를 뺐다: ${src.slice(0, 80)}` });
          parent.children = parent.children.filter((c) => c !== n);
          continue;
        }
        if (!alt) warnings.push({ fatal: false, msg: `이미지에 설명(캡션)이 없다: ${r.url}` });
        n.properties = { src: r.url, alt, width: r.width, height: r.height, decoding: 'async' };
        images.push(r);
      }
      // 첫 이미지는 먼저(LCP), 나머지는 늦게
      let first = true;
      walk(tree, (n) => {
        if (n.type !== 'element' || n.tagName !== 'img') return;
        if (first) n.properties.fetchPriority = 'high';
        else n.properties.loading = 'lazy';
        first = false;
      });
    })
    .use(rehypeSanitize, schema)
    // 문법 색(S-020): 정리한 뒤에 입힌다 — 글자를 span.hljs-*로 감쌀 뿐이라 안전하고, 색은 CSS 클래스라 CSP 그대로
    .use(rehypeHighlight, { detect: false, aliases: { bash: ['sh', 'shell', 'zsh', 'console'] } })
    .use(() => (tree) => {
      // 줄 번호: pre 안 코드 옆에 숫자 열(aria-hidden). pre는 줄을 접지 않아 높이가 맞는다
      walk(tree, (n) => {
        if (n.type !== 'element' || n.tagName !== 'pre') return;
        const code = n.children.find((c) => c.type === 'element' && c.tagName === 'code');
        if (!code) return;
        const lines = textOf(code).replace(/\n$/, '').split('\n').length;
        const numbers = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
        n.children = [{ type: 'element', tagName: 'span', properties: { className: ['code-ln'], ariaHidden: 'true' }, children: [{ type: 'text', value: numbers }] }, code];
      });
      // 이어진 단계(div.blog-step)를 div.blog-steps 하나로 묶는다(daisyUI .steps·.step과 겹치지 않게 blog- 접두) — 번호는 CSS counter
      walk(tree, (n) => {
        if (!n.children?.length || (n.properties?.className ?? []).includes('blog-steps')) return;
        const out = [];
        let group = null;
        for (const c of n.children) {
          const isStep = c.type === 'element' && c.tagName === 'div' && (c.properties?.className ?? []).includes('blog-step');
          if (isStep) {
            if (!group) out.push((group = { type: 'element', tagName: 'div', properties: { className: ['blog-steps'] }, children: [] }));
            group.children.push(c);
          } else if (group && c.type === 'text' && !c.value.trim()) {
            /* 단계 사이 빈 줄 */
          } else {
            group = null;
            out.push(c);
          }
        }
        n.children = out;
      });
    })
    .use(rehypeSlug)
    // 목차와 바깥 링크
    .use(() => (tree) => {
      walk(tree, (n) => {
        if (n.type !== 'element') return;
        if (n.tagName === 'h2' || n.tagName === 'h3') toc.push({ depth: Number(n.tagName[1]), id: n.properties.id, text: textOf(n) });
        if (n.tagName === 'a' && /^https?:\/\//.test(String(n.properties.href ?? ''))) {
          n.properties.rel = 'noopener';
          n.properties.target = '_blank';
        }
      });
    })
    .use(rehypeStringify);

  const html = String(await processor.process(markdown));
  return { html, toc, images, warnings };
}

/** slug 규칙: 영문 소문자·숫자·하이픈, 2~80자 */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])$/;

/** 글 메타 점검(올리기 전). 오류면 그 글은 올리지 않는다 */
export function checkMeta(meta) {
  const errors = [];
  const warns = [];
  if (!meta.title?.trim()) errors.push('제목이 없다');
  if (!SLUG.test(meta.slug ?? '')) errors.push(`slug 형식이 아니다(영문 소문자·숫자·하이픈): "${meta.slug ?? ''}"`);
  if (!['ko', 'en'].includes(meta.locale)) errors.push(`언어가 ko·en이 아니다: "${meta.locale ?? ''}"`);
  if (!meta.date) errors.push('발행일이 없다');
  const [min, max] = meta.locale === 'en' ? [70, 170] : [40, 120];
  const n = meta.summary?.trim().length ?? 0;
  if (!n) errors.push('요약이 없다(검색·공유 설명)');
  else if (n < min || n > max) warns.push(`요약 ${n}자(권장 ${min}~${max}자)`);
  return { errors, warns };
}
