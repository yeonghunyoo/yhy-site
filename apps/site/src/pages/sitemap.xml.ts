import type { APIRoute } from 'astro';
import { absolute, alternates, publicPages } from '../lib/seo';

// ko·en을 xhtml:link로 서로 잇는다(docs/01-frontend.md "SEO·GEO"). 페이지마다 언어별 <url>을 하나씩.
export const prerender = true;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const GET: APIRoute = async ({ site }) => {
  const urls: string[] = [];
  for (const page of await publicPages()) {
    const alts = alternates(page.path, page.locales);
    for (const a of alts) {
      const links = alts.map((b) => `    <xhtml:link rel="alternate" hreflang="${b.locale}" href="${esc(absolute(site!, b.path))}"/>`);
      urls.push(`  <url>\n    <loc>${esc(absolute(site!, a.path))}</loc>\n${links.join('\n')}\n  </url>`);
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
