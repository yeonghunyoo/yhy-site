import ko from './ko.json';
import en from './en.json';

export const locales = ['ko', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ko';

export type Dict = typeof ko;
const dicts: Record<Locale, Dict> = { ko, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function t(locale: Locale): Dict {
  return dicts[locale];
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ko' ? 'en' : 'ko';
}

/** `/ko/projects/x` → `/en/projects/x` */
export function switchLocalePath(path: string, to: Locale): string {
  const rest = path.replace(/^\/(ko|en)(?=\/|$)/, '');
  return `/${to}${rest || '/'}`;
}

/** Accept-Language 헤더에서 지원 언어를 고른다. 없으면 기본(ko). */
export function pickLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return ranked.find((r) => isLocale(r.lang))?.lang as Locale | undefined ?? defaultLocale;
}
