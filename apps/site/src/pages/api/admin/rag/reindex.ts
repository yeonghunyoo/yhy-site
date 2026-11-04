import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { ragChunks } from '../../../../db/schema';
import { adminGuard, backTo, hasRagSyncToken } from '../../../../lib/server/admin';
import { embed } from '../../../../lib/server/ai';
import { getDb } from '../../../../lib/server/db';
import { hasVectorSearch } from '../../../../lib/server/rag';

export const prerender = false;

const BATCH = 50;
export const VECTOR_IDS_KEY = 'rag:vector-ids';
export const VECTOR_SYNCED_KEY = 'rag:vector-synced';

/**
 * D1 rag_chunks와 Vectorize를 맞춘다. id가 내용 해시라 새로 생긴 청크만 임베딩하고 사라진 청크만 지운다.
 * Vectorize에는 id 목록 API가 없어, 넣어 둔 id를 KV에 적어 두고 비교한다.
 */
export const POST: APIRoute = async (context) => {
  // 자동 동기화(scripts/rag-sync.mjs)는 관리자 세션 대신 토큰으로 오고, 결과를 JSON으로 받는다.
  const bySync = hasRagSyncToken(context.request, context.url.pathname);
  if (!bySync) {
    const denied = adminGuard(context);
    if (denied) return denied;
  }
  if (!hasVectorSearch()) return bySync ? Response.json({ error: 'no_vector' }, { status: 503 }) : backTo('/admin/chat', 'no_vector');
  const VEC = (env as unknown as { VEC: VectorizeIndex }).VEC;

  const chunks = await getDb().select().from(ragChunks);
  const current = new Set(chunks.map((c) => c.id));
  const previous = new Set(JSON.parse((await env.KV.get(VECTOR_IDS_KEY)) ?? '[]') as string[]);
  const added = chunks.filter((c) => !previous.has(c.id));
  const stale = [...previous].filter((id) => !current.has(id));

  for (let i = 0; i < added.length; i += BATCH) {
    const batch = added.slice(i, i + BATCH);
    const vectors = await embed(batch.map((c) => c.text));
    await VEC.upsert(
      batch.map((c, j) => ({ id: c.id, values: vectors[j], metadata: { section_id: c.sectionId, slug: c.slug, locale: c.locale, kind: c.kind } })),
    );
  }
  for (let i = 0; i < stale.length; i += 100) await VEC.deleteByIds(stale.slice(i, i + 100));

  await env.KV.put(VECTOR_IDS_KEY, JSON.stringify([...current]));
  await env.KV.put(VECTOR_SYNCED_KEY, JSON.stringify({ at: Date.now(), added: added.length, removed: stale.length }));
  if (bySync) return Response.json({ chunks: current.size, added: added.length, removed: stale.length });
  return backTo('/admin/chat', 'reindexed');
};
