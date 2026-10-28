// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// 기본은 정적(prerender). 동적 경로(/admin, /api, /auth)는 2단계부터 페이지별로 `prerender = false`.
export default defineConfig({
  output: 'static',
  // 세션은 Better Auth(D1)가 맡는다 — Astro 세션용 KV(SESSION) 자동 생성을 끈다.
  session: false,
  adapter: cloudflare({
    // 이미지는 빌드 시 최적화하고 런타임은 그대로 서빙 — Cloudflare Images 바인딩 불필요.
    imageService: 'compile',
  }),
});
