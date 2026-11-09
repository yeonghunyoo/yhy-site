// JSON-LD(docs/01-frontend.md "SEO·GEO"): 홈 Person + WebSite, 프로젝트 상세 CreativeWork.
// 화면과 같은 데이터(i18n·career·stack·projects 컬렉션)에서 만든다 — 화면을 고치면 여기도 따라간다.
// 절대 URL은 Astro.site에서만. 실행되지 않는 데이터 블록이라 CSP와 상관없다.
import { locales, t, type Locale } from '../i18n';
import { career } from '../data/career';
import { stack } from '../data/stack';
import { absolute } from './seo';

type Node = Record<string, unknown>;

const personId = (site: URL) => `${new URL('/', site).href}#person`;
const websiteId = (site: URL) => `${new URL('/', site).href}#website`;

/** 프로필 링크(sameAs). GitHub 주소는 i18n `home.github`와 같다 */
function sameAs(locale: Locale): string[] {
  return [`https://${t(locale).home.github}`];
}

export function personNode(site: URL, locale: Locale): Node {
  const dict = t(locale);
  const now = career(locale).jobs.find((j) => j.current);
  // 다른 언어 이름과 사이트 이름(Yeonghun.y)을 별칭으로
  const alternateName = [...new Set([...locales.filter((l) => l !== locale).map((l) => t(l).site.person), dict.site.name])];
  return {
    '@type': 'Person',
    '@id': personId(site),
    name: dict.site.person,
    alternateName,
    url: absolute(site, `/${locale}/`),
    jobTitle: dict.site.role,
    email: `mailto:${dict.contact.mail}`,
    sameAs: sameAs(locale),
    ...(now && { worksFor: { '@type': 'Organization', name: now.name } }),
    knowsAbout: stack(locale).flatMap((g) => g.items),
  };
}

export function websiteNode(site: URL, locale: Locale): Node {
  const dict = t(locale);
  return {
    '@type': 'WebSite',
    '@id': websiteId(site),
    url: new URL('/', site).href,
    name: dict.site.name,
    description: dict.site.description,
    inLanguage: [...locales],
    author: { '@id': personId(site) },
    publisher: { '@id': personId(site) },
  };
}

/** 홈: Person + WebSite */
export function homeJsonLd(site: URL, locale: Locale): Node {
  return { '@context': 'https://schema.org', '@graph': [personNode(site, locale), websiteNode(site, locale)] };
}

/** `2026.09 ~` → `2026-09` (못 읽으면 없음) */
export function periodStart(period?: string): string | undefined {
  const m = period?.match(/^(\d{4})\.(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : undefined;
}

interface ProjectLike {
  slug: string;
  data: { title: string; summary: string; stack: string[]; period?: string };
}

/** 프로젝트 상세: CreativeWork. 사람은 홈의 Person을 @id로 가리키고, 이 페이지에도 이름은 적어 둔다 */
export function projectJsonLd(site: URL, locale: Locale, project: ProjectLike): Node {
  const dict = t(locale);
  const created = periodStart(project.data.period);
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    '@id': `${absolute(site, `/${locale}/projects/${project.slug}/`)}#work`,
    name: project.data.title,
    description: project.data.summary,
    url: absolute(site, `/${locale}/projects/${project.slug}/`),
    inLanguage: locale,
    keywords: project.data.stack.join(', '),
    ...(created && { dateCreated: created }),
    author: { '@type': 'Person', '@id': personId(site), name: dict.site.person, url: absolute(site, `/${locale}/`) },
    isPartOf: { '@id': websiteId(site) },
  };
}

/** `<script type="application/ld+json">` 안에 넣을 문자열. `</script>`로 끊기지 않게 `<`를 이스케이프한다 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
