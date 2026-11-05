// 홈 "스택" 섹션(11/05, decisions S-010). 근거는 src/content/rag/stack.{ko,en}.md — 바꾸면 둘 다 맞춘다.
// 실무 = 회사 업무로 써 본 것, 개인 프로젝트 = 직접 만든 서비스에서 써 본 것(S-001).
import type { Locale } from '../i18n';

type L = Record<Locale, string>;
const same = (s: string): L => ({ ko: s, en: s });

const GROUPS: { title: L; items: L[] }[] = [
  {
    title: { ko: '실무', en: 'At work' },
    items: [same('Swift · iOS'), same('RxSwift'), same('Fastlane'), same('Flutter · Dart'), { ko: '에이전트 · RAG', en: 'Agents · RAG' }],
  },
  {
    title: { ko: '개인 프로젝트', en: 'Personal projects' },
    items: [
      same('SwiftUI'),
      same('Kotlin · Jetpack Compose'),
      same('Python'),
      same('TypeScript'),
      same('Cloudflare Workers · D1 · R2 · KV'),
      same('Hono'),
      same('Astro'),
      same('React'),
      same('Tailwind CSS'),
      same('Workers AI · Vectorize'),
    ],
  },
];

export function stack(locale: Locale) {
  return GROUPS.map((g) => ({ title: g.title[locale], items: g.items.map((i) => i[locale]) }));
}
