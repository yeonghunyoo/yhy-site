// 홈 경력(11/03): 날짜 축 없이 기간만 이어 붙인다 — 회사 사이 공백은 보여 주지 않는다(docs/01-frontend.md "홈").
// 지금 회사의 기간은 빌드한 달까지 센다(시작 달 포함).
import type { Locale } from '../i18n';

interface Job {
  name: Record<Locale, string>;
  /** 이름 아래 작은 글씨(파견·고객사 등) */
  note?: Record<Locale, string>;
  months?: number;
  since?: [number, number];
}

const JOBS: Job[] = [
  { name: { ko: '알파이글루', en: 'AlphaIgloo' }, months: 17 },
  { name: { ko: '홀리츠', en: 'holich' }, months: 23 },
  { name: { ko: '트립에이드', en: 'Tripaid' }, months: 11 }, // 2025.10 ~ 2026.09(9월은 아래로 센다)
  // 소속은 클러쉬(주), 고객사는 이름 대신 '반도체사'로 쓴다(관례: 소속 회사 + 고객사)
  { name: { ko: '클러쉬(주)', en: 'Clush' }, note: { ko: '반도체사 파견', en: 'at a semiconductor company' }, since: [2026, 9] }, // 2026.09.14 ~
];

export function career(locale: Locale, now = new Date()) {
  const jobs = JOBS.map((j) => {
    const months = j.months ?? now.getFullYear() * 12 + (now.getMonth() + 1) - (j.since![0] * 12 + j.since![1]) + 1;
    return { name: j.name[locale], note: j.note?.[locale], months, current: Boolean(j.since) };
  });
  return { jobs, total: jobs.reduce((t, j) => t + j.months, 0) };
}

export function formatMonths(n: number, locale: Locale): string {
  const y = Math.floor(n / 12), m = n % 12;
  if (locale === 'ko') return [y ? `${y}년` : '', m ? `${m}개월` : ''].filter(Boolean).join(' ') || '0개월';
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || '0 mo';
}
