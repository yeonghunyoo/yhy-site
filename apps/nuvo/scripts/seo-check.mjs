// SEO 자동 점검 (docs/seo.md): 빌드 결과(dist/client)를 읽어 검사한다. 오류가 있으면 exit 1.
//   pnpm nuvo build && node apps/nuvo/scripts/seo-check.mjs
//   도메인 항목까지 보려면 같은 NUVO_SITE_URL로 빌드하고 점검: NUVO_SITE_URL=https://도메인 pnpm nuvo build && NUVO_SITE_URL=https://도메인 node ...
// 포트폴리오의 apps/site/scripts/seo-check.mjs와 같은 생각 — 라이브러리 없이 정규식으로. nuvo는 노출 페이지가 랜딩 하나라 작다
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", "dist", "client");
const site = (process.env.NUVO_SITE_URL ?? "").replace(/\/+$/, "") || null;
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const read = (p) => (existsSync(join(dist, p)) ? readFileSync(join(dist, p), "utf8") : null);
const fileOf = (url) => (url ? join(dist, url.replace(site ?? "", "").split("?")[0]) : null);

const html = read("index.html");
if (!html) {
  console.error("dist/client/index.html이 없어요 — 먼저 pnpm nuvo build");
  process.exit(1);
}
const meta = (attr, key) => [...html.matchAll(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`, "g"))].map((m) => m[1]);
const one = (attr, key) => {
  const v = meta(attr, key);
  if (v.length === 0) err(`${key} 없음`);
  if (v.length > 1) err(`${key}가 ${v.length}번`);
  return v[0];
};
const len = (s) => [...(s ?? "")].length;

// 1. <head> 기본
if (!/^<!doctype html>/i.test(html.trim())) err("doctype 없음");
if (!/<html lang="ko"/.test(html)) err('<html lang="ko"> 없음');
const charsetAt = html.search(/<meta charset=/i);
if (charsetAt < 0 || charsetAt > 1024) err("charset이 없거나 앞 1024바이트 밖");
if (!/<meta name="viewport"/.test(html)) err("viewport 없음");
const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
if (!title) err("title 없음");
else if (len(title) > 40) warn(`title ${len(title)}자 (40자 이하 권장)`);
const desc = one("name", "description");
if (desc && (len(desc) < 40 || len(desc) > 120)) warn(`description ${len(desc)}자 (40~120자 권장)`);
for (const [rel, path] of [["icon", "/favicon.svg"], ["apple-touch-icon", "/apple-touch-icon.png"], ["manifest", "/manifest.webmanifest"]]) {
  if (!html.includes(`rel="${rel}" href="${path}"`)) err(`<link rel="${rel}"> 없음`);
  if (!existsSync(join(dist, path))) err(`${path} 파일 없음`);
}
const manifest = read("manifest.webmanifest");
if (manifest) {
  try {
    const m = JSON.parse(manifest);
    for (const i of m.icons ?? []) if (!existsSync(join(dist, i.src))) err(`매니페스트 아이콘 ${i.src} 파일 없음`);
  } catch {
    err("manifest.webmanifest JSON 파싱 실패");
  }
}

// 2. 공유 미리보기
for (const k of ["og:type", "og:site_name", "og:locale", "og:title", "og:description", "og:image", "og:image:width", "og:image:height", "og:image:alt"]) one("property", k);
for (const k of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) one("name", k);
const ogImage = meta("property", "og:image")[0];
if (ogImage && !existsSync(fileOf(ogImage))) err(`og:image 파일 없음: ${ogImage}`);
if (meta("name", "twitter:card")[0] !== "summary_large_image") warn("twitter:card가 summary_large_image가 아님");

// 3. 도메인 항목
const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
if (site) {
  if (canonical !== `${site}/`) err(`canonical이 ${site}/ 가 아님: ${canonical}`);
  if (meta("property", "og:url")[0] !== canonical) err("og:url ≠ canonical");
  for (const k of [["property", "og:image"], ["name", "twitter:image"]]) if (!meta(...k)[0]?.startsWith(`${site}/`)) err(`${k[1]}가 절대 주소가 아님`);
  const sm = read("sitemap.xml");
  if (!sm) err("sitemap.xml 없음");
  else if (!sm.includes(`<loc>${site}/</loc>`)) err("sitemap에 랜딩 없음");
} else {
  warn("NUVO_SITE_URL 없이 빌드 — canonical·og:url·sitemap·절대 이미지 주소는 도메인 뒤 (docs/seo.md 🌐)");
  if (canonical) err("도메인 없이 canonical이 있음");
}

// 4. JSON-LD
for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try {
    const j = JSON.parse(m[1]);
    if (j["@context"] !== "https://schema.org") err("JSON-LD @context가 schema.org가 아님");
  } catch {
    err("JSON-LD 파싱 실패");
  }
}
if (!/application\/ld\+json/.test(html)) err("JSON-LD 없음");

// 5. 스크립트 없이 보이는 본문 (정적 랜딩)
const body = html.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/)?.[1] ?? "";
const h1 = body.match(/<h1[\s>]/g)?.length ?? 0;
if (h1 !== 1) err(`정적 랜딩 h1이 ${h1}개`);
if (!/<main>/.test(body)) err("정적 랜딩에 <main> 없음");
if ((body.replace(/<[^>]+>/g, "").trim().length ?? 0) < 80) err("정적 랜딩 본문이 거의 비어 있음 (스크립트 없이 빈 페이지)");
if (!/html\[data-route=("?)app\1\] #static-landing\{display:none\}/.test(html)) err("다른 화면에서 정적 랜딩을 숨기는 규칙 없음");
for (const m of body.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) if (!/rel="[^"]*noopener/.test(m[0])) warn("target=_blank에 noopener 없음");
for (const m of body.matchAll(/<img [^>]*>/g)) if (!/ alt="/.test(m[0])) err("img alt 없음");

// 6. robots·llms·노출 범위 헤더
const robots = read("robots.txt");
if (!robots) err("robots.txt 없음");
else {
  if (!/^Allow: \/\$$/m.test(robots)) err("robots.txt가 랜딩(/)을 허용하지 않음");
  if (site && !robots.includes(`Sitemap: ${site}/sitemap.xml`)) err("robots.txt에 Sitemap 줄 없음");
}
if (!read("llms.txt")) warn("llms.txt 없음");
const headers = read("_headers") ?? "";
if (!/\/\*\n(?:  .+\n)*  X-Robots-Tag: noindex/.test(headers)) err("_headers: /* 에 X-Robots-Tag noindex 없음 (D-004)");
if (!/\n\/\n  ! X-Robots-Tag/.test(headers)) err("_headers: 랜딩(/)에서 noindex를 떼지 않음");

for (const w of warns) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✗ ${e}`);
console.log(errors.length ? `\nSEO 점검 실패 (오류 ${errors.length}, 경고 ${warns.length})` : `\nSEO 점검 통과 (경고 ${warns.length})`);
process.exit(errors.length ? 1 : 0);
