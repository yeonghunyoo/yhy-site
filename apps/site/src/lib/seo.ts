// SEO·GEO 공용(docs/01-frontend.md "SEO·GEO"). 절대 URL은 Astro.site(astro.config.mjs `site`)에서만 만든다.
import { getCollection } from 'astro:content';
import { locales, switchLocalePath, type Locale } from '../i18n';
import { splitProjectId } from './projects';

/** OG locale 표기 */
export const ogLocale: Record<Locale, string> = { ko: 'ko_KR', en: 'en_US' };

/** 경로 끝을 `/`로 맞춘다(빌드 형식 directory — /ko/privacy/). 파일 경로(.txt 등)는 그대로 */
export function normalizePath(path: string): string {
  if (/\.[a-z0-9]+$/i.test(path)) return path;
  return path.endsWith('/') ? path : `${path}/`;
}

export function absolute(site: URL, path: string): string {
  return new URL(normalizePath(path), site).href;
}

/** 이 경로의 언어별 대응 경로. 프로젝트는 그 언어 본문이 있을 때만 */
export function alternates(path: string, available: readonly Locale[] = locales) {
  return available.map((l) => ({ locale: l, path: normalizePath(switchLocalePath(path, l)) }));
}

/** 색인할 공개 페이지(sitemap). 관리자·API·인증·미디어는 넣지 않는다 */
export async function publicPages(): Promise<{ path: string; locales: Locale[] }[]> {
  const pages: { path: string; locales: Locale[] }[] = [
    { path: '/ko/', locales: [...locales] },
    { path: '/ko/privacy/', locales: [...locales] },
  ];
  const bySlug = new Map<string, Locale[]>();
  for (const entry of await getCollection('projects')) {
    const { slug, locale } = splitProjectId(entry.id);
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), locale as Locale]);
  }
  for (const [slug, ls] of bySlug) pages.push({ path: `/${ls[0]}/projects/${slug}/`, locales: ls });
  return pages;
}
