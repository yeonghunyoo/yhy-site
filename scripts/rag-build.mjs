// RAG 청크 만들기 — 문서를 제목(##) 단위 섹션 → 500자 창(100자 겹침)으로 나눠 D1 rag_chunks에 넣는다.
// 사용: pnpm rag:build (로컬 D1) / pnpm rag:build:remote (운영 D1)
// 벡터(Vectorize)는 이 스크립트가 아니라 배포된 Worker의 /admin/chat "벡터 다시 만들기"가 만든다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHUNK = 500;
const OVERLAP = 100;
const remote = process.argv.includes('--remote');

/** 아주 단순한 frontmatter 파서(title, summary, stack만 쓴다) */
function parse(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (match) {
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^(title|summary|stack):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].replace(/^\[|\]$/g, '').replace(/^['"]|['"]$/g, '');
    }
  }
  const body = (match ? source.slice(match[0].length) : source).replace(/<!--[\s\S]*?-->/g, '').trim();
  return { meta, body };
}

function sections(body, fallback) {
  const out = [];
  let heading = fallback;
  let buf = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) out.push({ heading, text });
    buf = [];
  };
  for (const line of body.split('\n')) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
    } else buf.push(line);
  }
  flush();
  return out;
}

function windows(text) {
  if (text.length <= CHUNK) return [text];
  const out = [];
  for (let start = 0; start < text.length; start += CHUNK - OVERLAP) {
    out.push(text.slice(start, start + CHUNK));
    if (start + CHUNK >= text.length) break;
  }
  return out;
}

const docs = [];
const ragDir = 'src/content/rag';
for (const file of readdirSync(ragDir).filter((f) => f.endsWith('.md'))) {
  const [slug, locale] = file.replace(/\.md$/, '').split('.');
  docs.push({ slug, locale, ...parse(readFileSync(join(ragDir, file), 'utf8')) });
}
// 프로젝트 상세는 사이트 본문을 그대로 쓴다(중복 작성 없음).
const projectDir = 'src/content/projects';
for (const file of readdirSync(projectDir).filter((f) => f.endsWith('.md'))) {
  const [slug, locale] = file.replace(/\.md$/, '').split('.');
  const { meta, body } = parse(readFileSync(join(projectDir, file), 'utf8'));
  const header = [meta.title, meta.summary, meta.stack && `Stack: ${meta.stack}`].filter(Boolean).join('\n');
  docs.push({ slug: `projects/${slug}`, locale, meta, body: `# ${meta.title}\n${header}\n\n${body}` });
}

const rows = [];
for (const doc of docs) {
  let n = 0;
  for (const { heading, text } of sections(doc.body, doc.meta.title ?? doc.slug)) {
    for (const piece of windows(text)) {
      rows.push({ id: `${doc.slug}#${doc.locale}#${n++}`, slug: doc.slug, locale: doc.locale, heading, text: piece });
    }
  }
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [
  'DELETE FROM rag_chunks;',
  ...rows.map((r) => `INSERT INTO rag_chunks (id, slug, locale, heading, text) VALUES (${q(r.id)}, ${q(r.slug)}, ${q(r.locale)}, ${q(r.heading)}, ${q(r.text)});`),
].join('\n');

mkdirSync('.wrangler/tmp', { recursive: true });
const out = '.wrangler/tmp/rag-chunks.sql';
writeFileSync(out, sql);
console.log(`${docs.length} docs → ${rows.length} chunks (${out})`);

execFileSync('wrangler', ['d1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', out, '--yes'], { stdio: 'inherit' });
if (remote) console.log('운영에서 /admin/chat → "벡터 다시 만들기"로 Vectorize를 갱신하세요.');
