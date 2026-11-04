import { env } from 'cloudflare:workers';
import { inArray, like, or, sql } from 'drizzle-orm';
import type { Locale } from '../../i18n';
import { ragChunks, ragSections, type RagChunk, type RagSection } from '../../db/schema';
import { embed, hasAi, rerank } from './ai';
import { getDb } from './db';

// 질문 파이프라인 3~7단계(docs/05-06-chat-rag.md, WeKnora rag_stream 대응):
// 병렬 검색(Vectorize + FTS5) → 범위 판단 → RRF → (리랭크) → 부모 섹션으로 확장 → top-k.
export const RAG = {
  /** 검색기마다 가져오는 후보 수(최종 개수의 몇 배를 가져와 합친다) */
  searchTopK: 24,
  rrfK: 60,
  /** 가장 가까운 벡터가 이보다 낮으면 범위 밖 — 모델을 부르지 않고 거절한다(bge-m3 코사인, 11/01 측정: 관련 0.47~0.62, 무관 0.37 이하) */
  vectorMin: 0.42,
  /** 키워드에 안 걸린 벡터 후보는 이 점수 이상만 남긴다 */
  vectorSoft: 0.35,
  /** bge-reranker-base는 한국어 점수 차이가 거의 없어(11/01 측정) 끈다. 영어 문서만 쓰게 되면 다시 재본다 */
  rerank: false,
  rerankCandidates: 20,
  /** 프롬프트에 넣는 부모 섹션 수. 초안 문서가 섹션 10개 남짓이라 4개면 재작성 질문에 따라 필요한 섹션이 빠졌다(11/01) */
  topSections: 6,
  localeBoost: 1.2,
  faqBoost: 1.1,
} as const;

interface VectorBinding {
  query(vector: number[], options: { topK: number }): Promise<{ matches: { id: string; score: number }[] }>;
}
export const vectorIndex = () => (env as unknown as { VEC?: VectorBinding }).VEC;
export const hasVectorSearch = () => hasAi() && Boolean(vectorIndex());

// 한국어 조사·어미를 떼어 어간도 검색어로 쓴다("기술로" → "기술"). 형태소 분석 없이 흔한 끝말만.
const KO_SUFFIX = /(하나요|했나요|할까요|인가요|하는|하면|하고|해요|으로|에서|에게|까지|부터|처럼|이나|이랑|나요|어요|아요|은|는|이|가|을|를|에|의|와|과|로|도|만)$/;

/** 질문 → 검색어. trigram FTS는 3글자 이상만 맞추므로 2글자 말은 LIKE로 따로 찾는다. */
function terms(query: string) {
  const words = new Set<string>();
  for (const word of query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
    if (!word) continue;
    words.add(word);
    const stem = word.replace(KO_SUFFIX, '');
    if (stem !== word && [...stem].length >= 2) words.add(stem);
  }
  const list = [...words];
  return { long: list.filter((w) => [...w].length >= 3), short: list.filter((w) => [...w].length === 2) };
}

async function keywordSearch(query: string): Promise<string[]> {
  const db = getDb();
  const { long, short } = terms(query);
  const ids: string[] = [];
  if (long.length) {
    const match = long.map((w) => `"${w.replace(/"/g, '""')}"`).join(' OR ');
    const rows = await db.all<{ id: string }>(
      sql`SELECT c.id FROM rag_chunks_fts f JOIN rag_chunks c ON c.rowid = f.rowid WHERE rag_chunks_fts MATCH ${match} ORDER BY bm25(rag_chunks_fts) LIMIT ${RAG.searchTopK}`,
    );
    ids.push(...rows.map((r) => r.id));
  }
  if (short.length && ids.length < RAG.searchTopK) {
    const rows = await db
      .select({ id: ragChunks.id })
      .from(ragChunks)
      .where(or(...short.map((w) => like(ragChunks.text, `%${w}%`))))
      .limit(RAG.searchTopK);
    for (const r of rows) if (!ids.includes(r.id)) ids.push(r.id);
  }
  return ids.slice(0, RAG.searchTopK);
}

async function vectorSearch(query: string): Promise<{ id: string; score: number }[]> {
  const [vector] = await embed([query]);
  const result = await vectorIndex()!.query(vector, { topK: RAG.searchTopK });
  return result.matches.map((m) => ({ id: m.id, score: m.score }));
}

export interface ScoredSection {
  section: RagSection;
  score: number;
}

export interface RetrievalTrace {
  query: string;
  keyword: string[];
  vector: { id: string; score: number }[] | null; // null = 벡터 검색 불가(바인딩 없음·오류)
  maxVector: number | null;
  inScope: boolean;
  candidates: { id: string; slug: string; rrf: number; rerank?: number; score: number }[];
  sections: { id: string; slug: string; heading: string; score: number }[];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** 검색 → 범위 판단 → 합치기 → 부모 섹션 top-k. 범위 밖이면 sections가 빈 배열이다. */
export async function retrieve(query: string, locale: Locale): Promise<{ sections: ScoredSection[]; trace: RetrievalTrace }> {
  const [keyword, vector] = await Promise.all([
    keywordSearch(query),
    hasVectorSearch()
      ? vectorSearch(query).catch((error) => {
          console.error('[rag:vector]', error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  const maxVector = vector?.length ? Math.max(...vector.map((v) => v.score)) : null;
  // 범위 판단: 벡터 결과가 있으면 가장 가까운 청크 점수로, 없으면(바인딩 없음·오류·아직 벡터 갱신 전) 키워드 결과 유무로.
  const inScope = maxVector === null ? keyword.length > 0 : maxVector >= RAG.vectorMin;
  const trace: RetrievalTrace = { query, keyword, vector, maxVector, inScope, candidates: [], sections: [] };
  if (!inScope) return { sections: [], trace };

  // RRF: 키워드 순위 + 벡터 순위. 키워드에 안 걸린 약한 벡터 후보는 버린다.
  const rrf = new Map<string, number>();
  const add = (id: string, rank: number) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (RAG.rrfK + rank + 1));
  keyword.forEach(add);
  vector?.forEach((v, rank) => {
    if (v.score >= RAG.vectorSoft || keyword.includes(v.id)) add(v.id, rank);
  });
  if (rrf.size === 0) return { sections: [], trace };

  const db = getDb();
  const chunks = await db.select().from(ragChunks).where(inArray(ragChunks.id, [...rrf.keys()]));
  const maxRrf = Math.max(...rrf.values());
  let scored = chunks
    .map((chunk) => ({ chunk, rrf: (rrf.get(chunk.id) ?? 0) / maxRrf, rerank: undefined as number | undefined }))
    .sort((a, b) => b.rrf - a.rrf);

  if (RAG.rerank && hasAi()) {
    scored = scored.slice(0, RAG.rerankCandidates);
    const scores = await rerank(
      query,
      scored.map((s) => s.chunk.text),
    ).catch((error) => {
      console.error('[rag:rerank]', error);
      return null;
    });
    if (scores) {
      const max = Math.max(...scores) || 1;
      scored.forEach((s, i) => (s.rerank = scores[i] / max));
    }
  }

  const weight = (chunk: RagChunk) => (chunk.locale === locale ? RAG.localeBoost : 1) * (chunk.kind === 'faq' ? RAG.faqBoost : 1);
  const final = scored.map((s) => ({
    ...s,
    score: (s.rerank === undefined ? s.rrf : 0.6 * s.rerank + 0.4 * s.rrf) * weight(s.chunk),
  }));
  trace.candidates = final
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ id: s.chunk.id, slug: s.chunk.slug, rrf: round(s.rrf), rerank: s.rerank === undefined ? undefined : round(s.rerank), score: round(s.score) }));

  // 부모 섹션으로 올린다: 같은 부모는 가장 높은 자식 점수만.
  const bySection = new Map<string, number>();
  for (const s of final) bySection.set(s.chunk.sectionId, Math.max(bySection.get(s.chunk.sectionId) ?? 0, s.score));
  const top = [...bySection.entries()].sort((a, b) => b[1] - a[1]).slice(0, RAG.topSections);
  const rows = await db.select().from(ragSections).where(inArray(ragSections.id, top.map(([id]) => id)));
  const sections = top
    .map(([id, score]) => ({ section: rows.find((r) => r.id === id), score }))
    .filter((s): s is ScoredSection => Boolean(s.section));
  trace.sections = sections.map((s) => ({ id: s.section.id, slug: s.section.slug, heading: s.section.heading, score: round(s.score) }));
  return { sections, trace };
}
