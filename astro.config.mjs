// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// 기본은 정적(prerender). 동적 경로(/, /admin, /api, /auth)만 페이지별로 `prerender = false`.
export default defineConfig({
  output: 'static',
  // 세션은 Better Auth(D1)가 맡는다 — Astro 세션용 KV(SESSION) 자동 생성을 끈다.
  session: false,
  adapter: cloudflare({
    // 이미지는 빌드 시 최적화하고 런타임은 그대로 서빙 — Cloudflare Images 바인딩 불필요.
    imageService: 'compile',
  }),
  integrations: [
    react(),
    {
      name: 'client-demand',
      hooks: {
        'astro:config:setup': ({ addClientDirective }) => {
          addClientDirective({ name: 'demand', entrypoint: './src/directives/demand.ts' });
        },
      },
    },
  ],
  // 코드 하이라이트(Shiki)는 인라인 style을 써서 CSP와 충돌한다 — 지금은 코드 블록이 없으니 끈다.
  markdown: { syntaxHighlight: false },
  // 언어는 Astro i18n 라우팅 대신 직접 관리한다: /ko·/en은 src/pages/[locale]/, 문자열은 src/i18n/,
  // 루트 `/`는 src/pages/index.astro가 Accept-Language로 보낸다. (Astro i18n은 /admin처럼 접두어 없는 페이지를 404로 만든다)
  vite: { plugins: [tailwindcss()] },
  // CSP: 페이지마다 <meta>로 넣고, 인라인 스크립트·스타일은 Astro가 해시로 허용한다.
  // HTML의 style="" 속성은 막히므로 쓰지 않는다(Tailwind 클래스로). React의 style prop은 DOM API라 괜찮다.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
      ],
    },
  },
});
