import type { APIRoute } from 'astro';

// docs/01-frontend.md "SEO·GEO": 관리자·API·인증은 색인하지 않는다. /media/*는 R2에서 꺼내는 동적 경로라
// 크롤러가 몰리면 순간 제한·R2 비용을 쓴다 — 막는다. 공유 이미지는 public/·/_astro에 둔다.
export const prerender = true;

export const GET: APIRoute = ({ site }) =>
  new Response(
    ['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /auth/', 'Disallow: /media/', '', `Sitemap: ${new URL('/sitemap.xml', site).href}`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
