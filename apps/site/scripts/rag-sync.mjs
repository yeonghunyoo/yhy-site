// RAG 운영 동기화 — 문서 → 운영 D1(바뀐 게 있을 때만) → 배포된 Worker의 벡터 갱신. 설계: docs/05-06-chat-rag.md "넣기" 7.
// 사용: pnpm rag:sync:remote [--force]  (--force: id가 같아도 D1을 다시 넣는다)
// 토큰: 환경변수 RAG_SYNC_TOKEN 또는 .prod.vars. 없으면 D1만 넣고 /admin/chat "벡터 갱신"을 안내한다.
// 주소: 환경변수 RAG_SYNC_URL, 없으면 wrangler.jsonc의 BETTER_AUTH_URL.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const force = process.argv.includes('--force');

function fromProdVars(key) {
  if (!existsSync('.prod.vars')) return undefined;
  const line = readFileSync('.prod.vars', 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

const token = process.env.RAG_SYNC_TOKEN || fromProdVars('RAG_SYNC_TOKEN');
const site = (
  process.env.RAG_SYNC_URL || readFileSync('wrangler.jsonc', 'utf8').match(/"BETTER_AUTH_URL":\s*"([^"]+)"/)?.[1] || ''
).replace(/\/$/, '');

// 1. 로컬 문서의 자식 id(내용 해시)와 운영 D1의 id를 비교한다 — 같으면 D1을 건드리지 않는다(넣는 동안 검색이 비는 것을 피함).
execFileSync('node', ['scripts/rag-build.mjs', '--dry'], { stdio: 'ignore' });
const sql = readFileSync('.wrangler/tmp/rag-chunks.sql', 'utf8');
const local = new Set([...sql.matchAll(/INSERT INTO rag_chunks \([^)]*\) VALUES \('([0-9a-f]+)'/g)].map((m) => m[1]));
const out = execFileSync('wrangler', ['d1', 'execute', 'DB', '--remote', '--json', '--command', 'SELECT id FROM rag_chunks'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const remote = new Set(JSON.parse(out.slice(out.indexOf('[')))[0].results.map((r) => r.id));
const added = [...local].filter((id) => !remote.has(id)).length;
const removed = [...remote].filter((id) => !local.has(id)).length;
console.log(`RAG 청크: 로컬 ${local.size} / 운영 D1 ${remote.size} (새로 ${added}, 지울 것 ${removed})`);

if (force || added || removed) execFileSync('node', ['scripts/rag-build.mjs', '--remote'], { stdio: 'inherit' });
else console.log('운영 D1은 이미 최신 — 넣기를 건너뛴다');

// 2. 벡터 갱신 — Worker의 같은 코드(임베딩·KV 기록)를 토큰으로 부른다.
if (!token) {
  console.log('RAG_SYNC_TOKEN이 없어 벡터 갱신은 건너뛴다 → /admin/chat에서 "벡터 갱신"을 누르세요.');
  process.exit(0);
}
const res = await fetch(`${site}/api/admin/rag/reindex`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, Origin: site },
});
const body = await res.text();
if (!res.ok) {
  console.error(`벡터 갱신 실패: HTTP ${res.status} ${body.slice(0, 200)}`);
  process.exit(1);
}
const result = JSON.parse(body);
console.log(`벡터 갱신: 청크 ${result.chunks}, 임베딩 ${result.added}, 삭제 ${result.removed}`);
