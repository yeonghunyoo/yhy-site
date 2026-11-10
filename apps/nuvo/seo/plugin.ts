/**
 * nuvo SEO·GEO 빌드 플러그인 (docs/seo.md). 랜딩 문구(src/pages/landing-copy.ts) 하나로 다음을 만든다.
 * - <head>: title·description·파비콘·아이콘·매니페스트·OG·Twitter·JSON-LD (+ 도메인이 있으면 canonical·og:url·절대 주소)
 * - 정적 랜딩: index.html의 #root 안에 랜딩 본문을 미리 넣는다 — 스크립트 없이도 검색엔진·AI 크롤러가 본문을 본다.
 *   React가 뜨면 createRoot가 이 내용을 갈아 끼운다. 같은 index.html을 쓰는 다른 화면(/library 등)에서는
 *   public/theme-init.js가 첫 페인트 전에 html[data-route=app]을 붙여 숨긴다(깜빡임 방지)
 * - 빌드 파일: robots.txt, manifest.webmanifest, llms.txt, (도메인이 있으면) sitemap.xml
 *
 * 도메인: 빌드할 때 환경변수 NUVO_SITE_URL(예: https://nuvo.example) — 없으면 도메인이 필요한 항목은 빠진다(docs/seo.md 🌐)
 * 검색 노출 범위는 public/_headers(X-Robots-Tag)가 정한다. 여기는 그 안에서 보여 줄 내용만
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HtmlTagDescriptor, Plugin } from "vite";
import { iconPaths } from "../src/components/icon-paths";
import { LANDING } from "../src/pages/landing-copy";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 공개(색인 허용) 페이지. 약관·개인정보처리방침이 생기면 여기에 더하고 _headers에서 noindex를 뗀다 */
export const PUBLIC_PATHS = ["/"];

function siteUrl() {
  const v = (process.env.NUVO_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (v && !/^https:\/\/[^/]+$/.test(v)) throw new Error(`NUVO_SITE_URL은 https://도메인 형태여야 해요: ${v}`);
  return v || null;
}

const icon = (name: keyof typeof iconPaths, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`;

/** React 랜딩(src/pages/Landing.tsx)과 같은 구조·클래스의 정적 본문. 셰이더·테마 버튼·로그인 상태는 React가 뜬 뒤에 */
export function staticLanding() {
  const L = LANDING;
  const btn = "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium transition-colors";
  return `<div id="static-landing" class="min-h-dvh">
<header class="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-5">
<span class="text-lg font-light tracking-[0.25em]">nuvo</span>
<a href="/signin" class="${btn} text-muted hover:text-text hover:bg-surface h-8 px-3 text-xs">${esc(L.cta.signIn)}</a>
</header>
<main>
<section class="relative flex h-dvh min-h-[560px] flex-col items-center justify-end overflow-hidden pb-[12vh] text-center">
<div class="relative px-6">
<h1 class="text-[clamp(2rem,6vw,3.6rem)] font-light leading-tight tracking-tight">${esc(L.heading.lead)} <span class="text-accent">${esc(L.heading.accent)}</span></h1>
<p class="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">${esc(L.lead)}</p>
<div class="mt-8 flex flex-wrap justify-center gap-3">
<a href="/signin" class="${btn} bg-accent text-accent-ink hover:opacity-90 h-11 px-6 text-sm">${esc(L.cta.start)}</a>
<a href="/library" class="${btn} border border-line text-text hover:bg-surface h-11 px-6 text-sm">${icon("laptop", 17)}${esc(L.cta.localOnly)}</a>
</div>
</div>
</section>
<section class="mx-auto grid max-w-5xl gap-10 px-6 py-24 sm:grid-cols-3">
${L.features
  .map(
    (f) => `<div>
<span class="flex size-10 items-center justify-center rounded-full bg-surface text-accent">${icon(f.icon)}</span>
<h2 class="mt-4 text-base font-medium">${esc(f.title)}</h2>
<p class="mt-2 text-sm leading-relaxed text-muted">${esc(f.body)}</p>
</div>`,
  )
  .join("\n")}
</section>
</main>
<footer class="border-t border-line px-6 py-8 text-center text-xs text-faint">${esc(L.footer)}</footer>
</div>`;
}

export function jsonLd(site: string | null) {
  const website: Record<string, unknown> = {
    "@type": "WebSite",
    name: "nuvo",
    alternateName: LANDING.title,
    description: LANDING.description,
    inLanguage: "ko",
  };
  const org: Record<string, unknown> = { "@type": "Organization", name: "nuvo" };
  if (site) {
    Object.assign(website, { "@id": `${site}/#website`, url: `${site}/`, publisher: { "@id": `${site}/#org` } });
    Object.assign(org, { "@id": `${site}/#org`, url: `${site}/`, logo: `${site}/icon-512.png` });
  }
  // </script>로 끝나지 않게 <를 이스케이프
  return JSON.stringify({ "@context": "https://schema.org", "@graph": [website, org] }).replace(/</g, "\\u003c");
}

export function llmsTxt(site: string | null) {
  const u = (p: string) => (site ? `${site}${p}` : p);
  return `# nuvo

> ${LANDING.description}

nuvo는 가족이 함께 쓰는 비공개 사진 앨범 서비스입니다. 한국어로 서비스합니다.

## 무엇을 하나요
${LANDING.features.map((f) => `- ${f.title}: ${f.body}`).join("\n")}

## 원칙
- 사진은 비공개가 기본입니다. 초대받은 사람만 볼 수 있고, 검색엔진에 사진이 노출되지 않습니다.
- 원본을 그대로 보관합니다(다시 압축하지 않음).
- 가족 공간(Space)으로 사진을 보낼 때 찍은 장소(위치)는 기본으로 함께 보내지 않습니다.
- 클라우드 보관은 선택 구독(개인 10GB)입니다. 한 사람이 구독하면 초대받은 가족은 구독 없이 그 공간을 보고 사진을 올릴 수 있습니다.
- 구독은 휴대폰 앱(App Store·Google Play)에서 합니다. 앱은 준비 중입니다.

## 링크
- 서비스: ${u("/")}
- 계정 삭제 안내: ${u("/account/delete")}
`;
}

function manifest() {
  return JSON.stringify(
    {
      name: "nuvo",
      short_name: "nuvo",
      description: LANDING.shareDescription,
      lang: "ko",
      start_url: "/library",
      scope: "/",
      display: "standalone",
      background_color: "#f8f5f1",
      theme_color: "#a0573a",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    null,
    2,
  );
}

function robots(site: string | null) {
  return `# nuvo: 비공개 사진 서비스. 공개 페이지만 검색에 노출한다 (docs/seo.md, docs/decisions.md D-004)
# 실제 차단은 X-Robots-Tag: noindex 헤더(public/_headers)가 한다 — robots.txt는 요청일 뿐
User-agent: *
${PUBLIC_PATHS.map((p) => `Allow: ${p}$`).join("\n")}
Allow: /llms.txt$
Disallow: /
${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`;
}

function sitemap(site: string) {
  const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${site}${p}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function nuvoSeo(): Plugin {
  const site = siteUrl();
  return {
    name: "nuvo-seo",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const tags: HtmlTagDescriptor[] = [
          { tag: "title", children: LANDING.title },
          { tag: "meta", attrs: { name: "description", content: LANDING.description } },
          { tag: "link", attrs: { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" } },
          { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
          { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" } },
          { tag: "meta", attrs: { property: "og:type", content: "website" } },
          { tag: "meta", attrs: { property: "og:site_name", content: "nuvo" } },
          { tag: "meta", attrs: { property: "og:locale", content: "ko_KR" } },
          { tag: "meta", attrs: { property: "og:title", content: LANDING.title } },
          { tag: "meta", attrs: { property: "og:description", content: LANDING.shareDescription } },
          // Vite가 빌드 자산 주소(/assets/og-해시.png)로 바꾼다. 도메인이 있으면 post 단계에서 절대 주소로
          { tag: "meta", attrs: { property: "og:image", content: "/src/assets/og.png" } },
          { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
          { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
          { tag: "meta", attrs: { property: "og:image:alt", content: `nuvo — ${LANDING.heading.lead} ${LANDING.heading.accent}` } },
          { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
          { tag: "meta", attrs: { name: "twitter:title", content: LANDING.title } },
          { tag: "meta", attrs: { name: "twitter:description", content: LANDING.shareDescription } },
          { tag: "meta", attrs: { name: "twitter:image", content: "/src/assets/og.png" } },
          { tag: "link", attrs: { rel: "alternate", type: "text/plain", href: "/llms.txt", title: "llms.txt" } },
          // 실행되지 않는 데이터라 CSP script-src와 상관없다 (scripts/csp-check.mjs로 확인)
          { tag: "script", attrs: { type: "application/ld+json" }, children: jsonLd(site) },
          // 정적 랜딩은 랜딩(/)에서만 보이게 — theme-init.js가 다른 화면에 data-route=app을 붙인다
          { tag: "style", children: 'html[data-route="app"] #static-landing{display:none}' },
        ];
        if (site) {
          tags.push(
            { tag: "link", attrs: { rel: "canonical", href: `${site}/` } },
            { tag: "meta", attrs: { property: "og:url", content: `${site}/` } },
          );
        }
        // charset·viewport 뒤에 오도록 </head> 바로 앞에 넣는다
        return {
          html: html.replace('<div id="root"></div>', `<div id="root">${staticLanding()}</div>`),
          tags: tags.map((t) => ({ ...t, injectTo: "head" as const })),
        };
      },
    },
    generateBundle() {
      if (this.environment && this.environment.name !== "client") return;
      const emit = (fileName: string, source: string) => this.emitFile({ type: "asset", fileName, source });
      emit("robots.txt", robots(site));
      emit("manifest.webmanifest", manifest());
      emit("llms.txt", llmsTxt(site));
      if (site) emit("sitemap.xml", sitemap(site));
    },
  };
}

/**
 * 도메인이 있으면 OG·Twitter 이미지 주소를 절대 주소로 (OG는 절대 주소가 원칙 — 카카오 등).
 * transformIndexHtml 단계에서는 자산 주소가 아직 자리표시자라, 파일을 다 쓴 뒤(writeBundle) index.html을 고친다
 */
export function nuvoSeoAbsolute(): Plugin {
  const site = siteUrl();
  return {
    name: "nuvo-seo-absolute",
    apply: "build",
    writeBundle(options) {
      if (!site || !options.dir || (this.environment && this.environment.name !== "client")) return;
      const file = join(options.dir, "index.html");
      const html = readFileSync(file, "utf8");
      writeFileSync(
        file,
        html.replace(
          /(<meta (?:property="og:image"|name="twitter:image") content=")(\/[^"]+)"/g,
          (_m, head: string, path: string) => `${head}${site}${path}"`,
        ),
      );
    },
  };
}
