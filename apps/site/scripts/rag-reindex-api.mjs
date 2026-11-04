// RAG 벡터 갱신(API) — /api/admin/rag/reindex와 같은 일을 Worker 없이 Cloudflare API로 한다.
// 설계: docs/05-06-chat-rag.md "넣기" 8. 운영 주소(*.workers.dev)에 닿지 않는 곳(클라우드 세션)에서 쓴다.
// 사용: pnpm rag:reindex:api [--dry]   (--dry: 읽기만 하고 새로·지울 개수만 출력)
// 필요: CLOUDFLARE_API_TOKEN(Workers AI·Vectorize·KV 쓰기·D1 읽기), CLOUDFLARE_ACCOUNT_ID
// 계산은 src/pages/api/admin/rag/reindex.ts와 같아야 한다 — 하나를 고치면 다른 쪽도 고친다.
import { readFileSync } from 'node:fs';

const dry = process.argv.includes('--dry');
const BATCH = 50;
const EMBED_MODEL = '@cf/baai/bge-m3'; // src/lib/server/ai.ts AI_MODELS.embedding
const VECTOR_IDS_KEY = 'rag:vector-ids';
const VECTOR_SYNCED_KEY = 'rag:vector-synced';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('CLOUDFLARE_API_TOKEN·CLOUDFLARE_ACCOUNT_ID가 필요하다.');
  process.exit(1);
}

// 바인딩 대신 wrangler.jsonc의 운영 리소스 id를 쓴다.
const config = readFileSync('wrangler.jsonc', 'utf8');
const dbId = config.match(/"binding":\s*"DB"[^}]*"database_id":\s*"([^"]+)"/)?.[1];
const kvId = config.match(/"binding":\s*"KV"[^}]*"id":\s*"([^"]+)"/)?.[1];
const index = config.match(/"binding":\s*"VEC"[^}]*"index_name":\s*"([^"]+)"/)?.[1];
if (!dbId || !kvId || !index) {
  console.error('wrangler.jsonc에서 DB·KV·VEC 설정을 찾지 못했다.');
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function call(path, { method = 'POST', body, type = 'application/json', raw = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': type } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    if (raw) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      return res.text();
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) return json.result;
    // Workers AI 용량 초과(3040)는 잠깐 쉬고 다시
    if (attempt < 3 && JSON.stringify(json.errors ?? '').includes('3040')) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  }
}

// 1. 운영 D1의 자식 청크
const [{ results: chunks }] = await call(`/d1/database/${dbId}/query`, {
  body: { sql: 'SELECT id, section_id, slug, locale, kind, text FROM rag_chunks' },
});
const current = new Set(chunks.map((c) => c.id));

// 2. 지난번에 넣은 id(KV)와 비교
const previous = new Set(JSON.parse((await call(`/storage/kv/namespaces/${kvId}/values/${VECTOR_IDS_KEY}`, { method: 'GET', raw: true })) ?? '[]'));
const added = chunks.filter((c) => !previous.has(c.id));
const stale = [...previous].filter((id) => !current.has(id));
console.log(`운영 D1 청크 ${current.size} · 지난 벡터 ${previous.size} → 새로 ${added.length}, 지울 것 ${stale.length}`);
if (dry) {
  console.log('--dry: 쓰지 않았다');
  process.exit(0);
}

// 3. 새 청크 임베딩 → upsert(NDJSON)
let neurons = 0;
for (let i = 0; i < added.length; i += BATCH) {
  const batch = added.slice(i, i + BATCH);
  const result = await call(`/ai/run/${EMBED_MODEL}`, { body: { text: batch.map((c) => c.text) } });
  neurons += result.usage?.neurons ?? 0;
  if (result.data?.length !== batch.length) throw new Error(`임베딩 개수가 다르다: ${result.data?.length} / ${batch.length}`);
  const ndjson = batch
    .map((c, j) => JSON.stringify({ id: c.id, values: result.data[j], metadata: { section_id: c.section_id, slug: c.slug, locale: c.locale, kind: c.kind } }))
    .join('\n');
  await call(`/vectorize/v2/indexes/${index}/upsert`, { body: ndjson, type: 'application/x-ndjson' });
  console.log(`  임베딩·upsert ${Math.min(i + BATCH, added.length)}/${added.length}`);
}

// 4. 사라진 청크 삭제
for (let i = 0; i < stale.length; i += 100) await call(`/vectorize/v2/indexes/${index}/delete_by_ids`, { body: { ids: stale.slice(i, i + 100) } });

// 5. KV 기록(Worker와 같은 형식). 중간에 실패하면 여기까지 오지 않는다 — 다시 돌리면 같은 차이를 다시 계산한다(upsert는 같은 id를 덮어쓴다).
await call(`/storage/kv/namespaces/${kvId}/values/${VECTOR_IDS_KEY}`, { method: 'PUT', body: JSON.stringify([...current]), type: 'text/plain', raw: true });
await call(`/storage/kv/namespaces/${kvId}/values/${VECTOR_SYNCED_KEY}`, {
  method: 'PUT',
  body: JSON.stringify({ at: Date.now(), added: added.length, removed: stale.length }),
  type: 'text/plain',
  raw: true,
});
console.log(`벡터 갱신: 청크 ${current.size}, 임베딩 ${added.length}, 삭제 ${stale.length} · 뉴런 약 ${neurons.toFixed(1)}`);
console.log('Vectorize는 반영까지 수십 초 걸린다.');
