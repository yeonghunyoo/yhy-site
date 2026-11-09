// SEO 회귀 점검(11/09, docs/01-frontend.md "SEO·GEO" → "자동 점검", S-015). 빌드 결과(dist/client)의 HTML·sitemap·robots를 읽는다.
// 사용: pnpm seo:check (먼저 pnpm build). 배포 스크립트(scripts/deploy.sh)가 빌드 뒤 돌리고, 오류가 있으면 배포를 멈춘다.
// 오류 = 검색·공유에 바로 문제가 되는 것, 경고 = 고치면 좋은 것(종료 코드에 영향 없음). 라이브러리 없이 정규식으로 읽는다 — 빌드 HTML은 Astro가 만든 모양이 일정하다.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../dist/client', import.meta.url)));
if (!existsSync(ROOT)) {
  console.error('dist/client가 없다 — 먼저 pnpm build');
  process.exit(1);
}

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ── 읽기 도우미 ─────────────────────────────────────────────
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
/** 속성값. 값 없는 속성(`alt`)은 '' */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}(?:="([^"]*)"|(?=[\\s>/]))`));
  return m ? (m[1] ?? '') : undefined;
}
const decode = (s) => s?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const textOf = (s) => decode(s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

function htmlFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

// ── 페이지마다 ─────────────────────────────────────────────
const LIMIT = { title: { ko: 40, en: 65 }, desc: { ko: [40, 120], en: [70, 170] } };
const pages = [];

for (const file of htmlFiles(ROOT).sort()) {
  const path = '/' + relative(ROOT, file).replace(/index\.html$/, '');
  const html = readFileSync(file, 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const metas = tagsOf(head, 'meta');
  const links = tagsOf(head, 'link');
  const meta = (k) => metas.filter((t) => attr(t, 'name') === k || attr(t, 'property') === k).map((t) => decode(attr(t, 'content')));
  const linkHrefs = (rel) => links.filter((t) => attr(t, 'rel') === rel && !attr(t, 'hreflang')).map((t) => attr(t, 'href'));

  const lang = html.match(/<html\b[^>]*\slang="([^"]+)"/)?.[1];
  const locale = path.split('/')[1];
  const title = decode(head.match(/<title>([^<]*)<\/title>/)?.[1]);
  const desc = meta('description')[0];
  const noindex = /noindex/.test(meta('robots')[0] ?? '');
  const canonical = linkHrefs('canonical');
  const hreflang = links.filter((t) => attr(t, 'hreflang')).map((t) => ({ lang: attr(t, 'hreflang'), href: attr(t, 'href') }));
  const page = { path, locale, title, desc, noindex, canonical: canonical[0], hreflang };
  pages.push(page);

  // 1. 문서 기본
  if (!/^<head>\s*<meta charset/i.test(html.slice(html.indexOf('<head>')))) err(path, 'charset가 <head> 첫 태그가 아니다');
  if (!meta('viewport').length) err(path, 'viewport 없음');
  if (lang !== locale && ['ko', 'en'].includes(locale)) err(path, `<html lang="${lang}">이 경로 언어(${locale})와 다르다`);
  if (!title) err(path, '<title> 없음');
  if (!desc) err(path, 'description 없음');
  if (!linkHrefs('icon').length) err(path, '파비콘 없음');
  if (!linkHrefs('apple-touch-icon').length) warn(path, 'apple-touch-icon 없음');
  if (noindex) continue; // 아래는 색인 페이지만

  const lim = LIMIT.title[locale] ?? 65;
  if (title && title.length > lim) warn(path, `title ${title.length}자(권장 ${lim}자 이내): ${title}`);
  const [dmin, dmax] = LIMIT.desc[locale] ?? [70, 170];
  if (desc && (desc.length < dmin || desc.length > dmax)) warn(path, `description ${desc.length}자(권장 ${dmin}~${dmax}자)`);

  if (canonical.length !== 1) err(path, `canonical ${canonical.length}개`);
  else if (!/^https:\/\//.test(canonical[0]) || new URL(canonical[0]).pathname !== path) err(path, `canonical이 자기 절대 주소가 아니다: ${canonical[0]}`);

  // 2. OG·Twitter
  for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:type', 'og:site_name', 'og:locale', 'twitter:card']) {
    const v = meta(k);
    if (!v.length) err(path, `${k} 없음`);
    else if (v.length > 1) err(path, `${k} 중복 ${v.length}번`);
  }
  if (meta('og:url')[0] !== canonical[0]) err(path, `og:url ≠ canonical`);
  const ogImage = meta('og:image')[0];
  if (ogImage) {
    if (!/^https:\/\//.test(ogImage)) err(path, `og:image가 절대 주소가 아니다: ${ogImage}`);
    else if (!existsSync(join(ROOT, new URL(ogImage).pathname))) err(path, `og:image 파일이 빌드에 없다: ${ogImage}`);
  }

  // 3. 다국어
  const self = hreflang.find((h) => h.lang === locale);
  if (!self) err(path, 'hreflang에 자기 언어가 없다');
  else if (self.href !== canonical[0]) err(path, `hreflang 자기 주소 ≠ canonical: ${self.href}`);
  if (!hreflang.some((h) => h.lang === 'x-default')) err(path, 'hreflang x-default 없음');

  // 6. 구조
  const h1 = [...html.matchAll(/<h1\b[\s\S]*?<\/h1>/g)].map((m) => textOf(m[0]));
  if (h1.length !== 1) err(path, `h1 ${h1.length}개`);
  const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  levels.forEach((lv, i) => i > 0 && lv > levels[i - 1] + 1 && warn(path, `제목 단계 건너뜀 h${levels[i - 1]} → h${lv}`));
  if (!html.includes('<main')) err(path, '<main> 없음');

  // 7. JSON-LD
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch {
      err(path, 'JSON-LD를 읽을 수 없다');
    }
  }

  // 9. 이미지
  for (const img of tagsOf(html, 'img')) {
    const src = attr(img, 'src');
    if (attr(img, 'alt') === undefined) err(path, `img alt 없음: ${src}`);
    if (!attr(img, 'width') || !attr(img, 'height')) warn(path, `img width·height 없음(CLS): ${src}`);
  }

  // 11. 새 창 링크
  for (const a of tagsOf(html, 'a')) {
    if (attr(a, 'target') === '_blank' && !/noopener|noreferrer/.test(attr(a, 'rel') ?? '')) warn(path, `target=_blank에 rel=noopener 없음: ${attr(a, 'href')}`);
  }
}

// ── 페이지 사이 ────────────────────────────────────────────
const indexed = pages.filter((p) => !p.noindex);
// 제목·설명 중복: 서로 hreflang 대응인 페이지(같은 글의 ko·en)끼리는 고유명사 제목이 같을 수 있어 뺀다
const pairs = (p, q) => p.hreflang.some((h) => h.href === q.canonical);
for (const key of ['title', 'desc']) {
  for (let i = 0; i < indexed.length; i++) {
    for (let j = i + 1; j < indexed.length; j++) {
      const [p, q] = [indexed[i], indexed[j]];
      if (p[key] && p[key] === q[key] && !(key === 'title' && pairs(p, q))) err(`${p.path} · ${q.path}`, `${key === 'title' ? 'title' : 'description'}이 같다: ${p[key]}`);
    }
  }
}
// hreflang 양방향: A가 B를 가리키면 B도 A를 가리킨다
const byUrl = new Map(indexed.map((p) => [p.canonical, p]));
for (const p of indexed) {
  for (const h of p.hreflang) {
    if (h.lang === 'x-default') continue;
    const q = byUrl.get(h.href);
    if (!q) err(p.path, `hreflang ${h.lang} 대상이 색인 페이지가 아니다: ${h.href}`);
    else if (!q.hreflang.some((b) => b.href === p.canonical)) err(p.path, `hreflang이 한쪽으로만 간다: ${h.href}`);
  }
}

// ── 4. sitemap·robots·llms.txt ────────────────────────────
const sitemapFile = join(ROOT, 'sitemap.xml');
if (!existsSync(sitemapFile)) err('sitemap.xml', '없음');
else {
  const locs = [...readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
  const canonicals = new Set(indexed.map((p) => p.canonical).filter(Boolean));
  for (const u of locs) if (!canonicals.has(u)) err('sitemap.xml', `색인 페이지가 아닌 주소(없는 페이지·noindex): ${u}`);
  for (const u of canonicals) if (!locs.includes(u)) err('sitemap.xml', `빠진 페이지: ${u}`);
}
const robotsFile = join(ROOT, 'robots.txt');
if (!existsSync(robotsFile)) err('robots.txt', '없음');
else {
  const robots = readFileSync(robotsFile, 'utf8');
  if (!/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m.test(robots)) err('robots.txt', 'Sitemap 줄 없음');
  if (/^Disallow: \/\s*$/m.test(robots)) err('robots.txt', '사이트 전체를 막고 있다(Disallow: /)');
}
if (!existsSync(join(ROOT, 'llms.txt'))) warn('llms.txt', '없음');

// ── 결과 ──────────────────────────────────────────────────
console.log(`SEO 점검: 페이지 ${pages.length}(색인 ${indexed.length}) · 오류 ${errors.length} · 경고 ${warnings.length}`);
for (const e of errors) console.log(`  ✗ ${e}`);
for (const w of warnings) console.log(`  △ ${w}`);
process.exit(errors.length ? 1 : 0);
