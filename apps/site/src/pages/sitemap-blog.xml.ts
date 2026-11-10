import type { APIRoute } from 'astro';
import { listedPosts } from '../lib/server/blog';
import { absolute } from '../lib/seo';

// 블로그 sitemap(docs/08-blog.md, S-017) — 글은 배포 없이 R2에서 바뀌므로 요청 때 만든다. robots.txt에 sitemap.xml과 함께 적는다.
// 같은 slug의 ko·en은 xhtml:link로 잇고, lastmod는 Notion 수정 시각
export const prerender = false;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = async ({ site }) => {
  const posts = await listedPosts(); // 목록 숨김 글은 넣지 않는다
  const urls: string[] = [];
  for (const locale of ['ko', 'en'] as const) {
    if (posts.some((p) => p.locale === locale)) urls.push(`  <url>\n    <loc>${esc(absolute(site!, `/${locale}/blog/`))}</loc>\n  </url>`);
  }
  for (const p of posts) {
    const pair = posts.filter((q) => q.slug === p.slug);
    const links = pair.length > 1 ? pair.map((q) => `\n    <xhtml:link rel="alternate" hreflang="${q.locale}" href="${esc(absolute(site!, `/${q.locale}/blog/${q.slug}/`))}"/>`).join('') : '';
    urls.push(`  <url>\n    <loc>${esc(absolute(site!, `/${p.locale}/blog/${p.slug}/`))}</loc>\n    <lastmod>${esc(p.updated)}</lastmod>${links}\n  </url>`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
