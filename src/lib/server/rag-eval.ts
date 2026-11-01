import type { Locale } from '../../i18n';
import evalSet from '../../content/rag/eval.json';
import { retrieve } from './rag';

// 기준 질문 세트로 검색 품질을 잰다(docs/05-06-chat-rag.md 평가). 모델 답변은 부르지 않는다.
export interface EvalRow {
  q: string;
  locale: Locale;
  expect: string[];
  got: string[];
  inScope: boolean;
  maxVector: number | null;
  pass: boolean;
}

export async function runEval(): Promise<{ rows: EvalRow[]; recall: number; refusal: number }> {
  const rows: EvalRow[] = [];
  for (const item of evalSet.questions as { q: string; locale: Locale; expect: string[] }[]) {
    const { trace } = await retrieve(item.q, item.locale);
    const got = [...new Set(trace.sections.map((s) => s.slug))];
    // 범위 안 질문: 기대 slug 중 하나라도 상위 섹션에 있으면 통과. 범위 밖 질문: 섹션이 없어야(거절) 통과.
    const pass = item.expect.length ? item.expect.some((slug) => got.includes(slug)) : got.length === 0;
    rows.push({ ...item, got, inScope: trace.inScope, maxVector: trace.maxVector, pass });
  }
  const rate = (list: EvalRow[]) => (list.length ? list.filter((r) => r.pass).length / list.length : 1);
  return {
    rows,
    recall: rate(rows.filter((r) => r.expect.length)),
    refusal: rate(rows.filter((r) => !r.expect.length)),
  };
}
