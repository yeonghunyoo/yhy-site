import type { APIRoute } from 'astro';
import { locales, t, type Locale } from '../i18n';
import { getProjects } from '../lib/projects';
import { career, formatMonths } from '../data/career';
import { stack } from '../data/stack';
import { absolute } from '../lib/seo';

// llms.txt(llmstxt.org, docs/01-frontend.md "SEO·GEO"): AI가 읽기 좋은 사이트 요약. 홈과 같은 데이터(i18n·career·stack·projects)에서 만든다.
// 영어를 먼저, 한국어를 이어서 쓴다. 프로젝트는 그 언어 본문이 있는 것만.
export const prerender = true;

const LABEL: Record<Locale, { about: string; career: string; total: string; now: string; stack: string; projects: string; contact: string; letter: string }> = {
  en: { about: 'About', career: 'Career', total: 'total', now: 'current', stack: 'Stack', projects: 'Projects', contact: 'Contact', letter: 'Letter form on the site (no sign-in)' },
  ko: { about: '소개', career: '경력', total: '총', now: '현재', stack: '스택', projects: '프로젝트', contact: '연락', letter: '사이트의 레터(로그인 없이)' },
};

async function section(site: URL, locale: Locale): Promise<string> {
  const dict = t(locale);
  const h = dict.home;
  const L = LABEL[locale];
  const { jobs, total } = career(locale);
  const lines: string[] = [];

  lines.push(`## ${L.about} (${locale})`, '');
  lines.push(`${dict.site.person} — ${dict.site.role}. ${h.statement.join(' ')} ${h.statementLead}`, '');
  lines.push(`- [${dict.site.name} (${locale})](${absolute(site, `/${locale}/`)})`, '');

  lines.push(`### ${L.career} (${L.total} ${formatMonths(total, locale)})`, '');
  for (const j of [...jobs].reverse()) {
    lines.push(`- ${j.name}${j.note ? ` (${j.note})` : ''}: ${formatMonths(j.months, locale)}${j.current ? ` · ${L.now}` : ''}`);
  }
  lines.push('');

  lines.push(`### ${L.stack}`, '');
  for (const g of stack(locale)) lines.push(`- ${g.title}: ${g.items.join(', ')}`);
  lines.push('');

  lines.push(`### ${L.projects}`, '');
  for (const p of await getProjects(locale)) {
    const d = p.data;
    const meta = [d.period, d.metric && `${d.metric.value}${d.metric.unit} ${d.metric.label}`, d.stack.join(', ')].filter(Boolean).join(' · ');
    lines.push(`- [${d.title}](${absolute(site, `/${locale}/projects/${p.slug}/`)}): ${d.summary}${meta ? ` (${meta})` : ''}`);
  }
  lines.push('');

  lines.push(`### ${L.contact}`, '');
  lines.push(`- Email: ${dict.contact.mail}`, `- ${L.letter}: ${absolute(site, `/${locale}/`)}#contact`, `- GitHub: https://${h.github}`, '');
  return lines.join('\n');
}

export const GET: APIRoute = async ({ site }) => {
  const en = t('en');
  const order: Locale[] = ['en', ...locales.filter((l) => l !== 'en')];
  const parts = [`# ${en.site.name} — ${en.site.person} (${t('ko').site.person})`, '', `> ${en.site.description} ${t('ko').site.description}`, ''];
  for (const l of order) parts.push(await section(site!, l));
  parts.push('## Optional', '', ...locales.map((l) => `- [${t(l).footer.privacy}](${absolute(site!, `/${l}/privacy/`)})`), `- [Sitemap](${new URL('/sitemap.xml', site).href})`, '');
  return new Response(parts.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
