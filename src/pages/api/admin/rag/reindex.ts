import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { ragChunks } from '../../../../db/schema';
import { adminGuard, backTo } from '../../../../lib/server/admin';
import { getDb } from '../../../../lib/server/db';
import { EMBEDDING_MODEL, vectorBindings } from '../../../../lib/server/rag';

export const prerender = false;

const BATCH = 50;
const IDS_KEY = 'rag:vector-ids';

/** D1 rag_chunks 전체를 임베딩해 Vectorize에 넣는다. 사라진 청크의 벡터는 지운다. */
export const POST: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;
  const { AI, VEC } = vectorBindings();
  if (!AI || !VEC) return backTo('/admin/chat', 'no_vector');

  const db = getDb();
  const chunks = await db.select().from(ragChunks);
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embedded = (await AI.run(EMBEDDING_MODEL, { text: batch.map((c) => `${c.heading}\n${c.text}`) })) as { data: number[][] };
    await VEC.upsert(batch.map((c, j) => ({ id: c.id, values: embedded.data[j], metadata: { slug: c.slug, locale: c.locale } })));
    await db.batch(
      batch.map((c) => db.update(ragChunks).set({ vectorId: c.id }).where(eq(ragChunks.id, c.id))) as [never, ...never[]],
    );
  }

  const current = new Set(chunks.map((c) => c.id));
  const previous = JSON.parse((await env.KV.get(IDS_KEY)) ?? '[]') as string[];
  const stale = previous.filter((id) => !current.has(id));
  if (stale.length) await VEC.deleteByIds(stale);
  await env.KV.put(IDS_KEY, JSON.stringify([...current]));

  return backTo('/admin/chat', 'reindexed');
};
