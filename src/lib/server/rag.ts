import { env } from 'cloudflare:workers';
import { inArray, like, or, sql } from 'drizzle-orm';
import type { Locale } from '../../i18n';
import { ragChunks, type RagChunk } from '../../db/schema';
import { getDb } from './db';

// 하이브리드 검색: Vectorize(벡터) top-8 + D1 FTS5(키워드) top-8 → RRF로 합쳐 top-5.
// 벡터 바인딩(AI·VEC)이 없으면(로컬·설정 전) 키워드만 쓴다.

export const EMBEDDING_MODEL = '@cf/baai/bge-m3';
const TOP_K = 8;
const RRF_K = 60;

interface VectorBindings {
  AI?: Ai;
  VEC?: VectorizeIndex;
}
export const vectorBindings = () => env as unknown as VectorBindings;
export const hasVectorSearch = () => Boolean(vectorBindings().AI && vectorBindings().VEC);

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
      sql`SELECT c.id FROM rag_chunks_fts f JOIN rag_chunks c ON c.rowid = f.rowid WHERE rag_chunks_fts MATCH ${match} ORDER BY bm25(rag_chunks_fts) LIMIT ${TOP_K}`,
    );
    ids.push(...rows.map((r) => r.id));
  }
  if (short.length && ids.length < TOP_K) {
    const rows = await db
      .select({ id: ragChunks.id })
      .from(ragChunks)
      .where(or(...short.flatMap((w) => [like(ragChunks.text, `%${w}%`), like(ragChunks.heading, `%${w}%`)])))
      .limit(TOP_K);
    for (const r of rows) if (!ids.includes(r.id)) ids.push(r.id);
  }
  return ids.slice(0, TOP_K);
}

async function vectorSearch(query: string): Promise<string[]> {
  const { AI, VEC } = vectorBindings();
  if (!AI || !VEC) return [];
  const embedded = (await AI.run(EMBEDDING_MODEL, { text: [query] })) as { data: number[][] };
  const result = await VEC.query(embedded.data[0], { topK: TOP_K });
  return result.matches.map((m) => m.id);
}

/** Reciprocal Rank Fusion + 질문 언어와 같은 문서에 가중치 */
export async function search(query: string, locale: Locale, limit = 5): Promise<RagChunk[]> {
  const [keyword, vector] = await Promise.all([keywordSearch(query), vectorSearch(query).catch(() => [])]);
  const scores = new Map<string, number>();
  for (const list of [keyword, vector]) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  if (scores.size === 0) return [];
  const rows = await getDb().select().from(ragChunks).where(inArray(ragChunks.id, [...scores.keys()]));
  return rows
    .map((row) => ({ row, score: (scores.get(row.id) ?? 0) * (row.locale === locale ? 1.2 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.row);
}
