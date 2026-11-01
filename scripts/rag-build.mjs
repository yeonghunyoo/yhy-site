// RAG 넣기 — 문서를 부모 섹션(## 단위, 최대 1,500자)과 자식 청크(문단·문장 경계 300~500자)로 나눠 D1에 넣는다.
// 설계: docs/05-06-chat-rag.md "넣기 파이프라인". id는 내용 해시라 문서를 고쳐도 바뀐 청크만 새 id가 된다.
// 사용: pnpm rag:build (로컬 D1) / pnpm rag:build:remote (운영 D1) / --dry (D1에 쓰지 않고 결과만 출력)
// 벡터(Vectorize)는 이 스크립트가 아니라 배포된 Worker의 /admin/chat "벡터 갱신"이 맞춘다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SECTION_MAX = 1500;
const CHUNK_MAX = 500;
const CHUNK_MIN = 300;
const remote = process.argv.includes('--remote');
const dry = process.argv.includes('--dry');

const hash = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);

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

/** `##` 제목 단위로 나눈다. 첫 제목 앞 본문은 문서 제목을 섹션 제목으로 쓴다. `#`은 버리고 `###` 이하는 본문에 남긴다. */
function sections(body, title) {
  const out = [];
  let heading = title;
  let buf = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) out.push({ heading, text });
    buf = [];
  };
  for (const line of body.split('\n')) {
    if (/^#\s/.test(line)) continue;
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
    } else buf.push(line);
  }
  flush();
  return out;
}

/** 문단 → 문장 순으로 쪼갠 조각 */
function units(text) {
  const out = [];
  for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (para.length <= CHUNK_MAX) out.push({ text: para, paraEnd: true });
    else {
      const sentences = para.split(/(?<=[.!?。])\s+|\n/).map((s) => s.trim()).filter(Boolean);
      sentences.forEach((s, i) => out.push({ text: s.slice(0, CHUNK_MAX), paraEnd: i === sentences.length - 1 }));
    }
  }
  return out;
}

/** 조각을 max 이하로 묶는다. min을 넘겼고 문단이 끝났으면 거기서 끊는다. 문단 중간에서 끊기면 마지막 문장을 다음 청크에 겹친다. */
function pack(text, max, min) {
  const out = [];
  let cur = [];
  const len = (list) => list.reduce((n, u) => n + u.text.length + 1, 0);
  for (const unit of units(text)) {
    if (cur.length && len(cur) + unit.text.length > max) {
      out.push(cur.map((u) => u.text).join('\n'));
      const last = cur[cur.length - 1];
      cur = !last.paraEnd && last.text.length + unit.text.length < max ? [last] : [];
    }
    cur.push(unit);
    if (unit.paraEnd && len(cur) >= min) {
      out.push(cur.map((u) => u.text).join('\n'));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.map((u) => u.text).join('\n'));
  return out;
}

function mdFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? mdFiles(path) : name.endsWith('.md') ? [path] : [];
  });
}

// 문서 모으기: src/content/rag/**/*.{locale}.md(faq.*는 FAQ) + 프로젝트 상세 본문 재사용
const docs = [];
const ragDir = 'src/content/rag';
for (const file of mdFiles(ragDir)) {
  const match = relative(ragDir, file).match(/^(.+)\.(ko|en)\.md$/);
  if (!match) continue;
  const [, slug, locale] = match;
  const { meta, body } = parse(readFileSync(file, 'utf8'));
  docs.push({ slug, locale, kind: slug === 'faq' ? 'faq' : 'doc', title: meta.title ?? slug, body });
}
const projectDir = 'src/content/projects';
for (const file of mdFiles(projectDir)) {
  const match = relative(projectDir, file).match(/^(.+)\.(ko|en)\.md$/);
  if (!match) continue;
  const [, slug, locale] = match;
  const { meta, body } = parse(readFileSync(file, 'utf8'));
  const title = meta.title ?? slug;
  const intro = [meta.summary, meta.stack && `Stack: ${meta.stack}`].filter(Boolean).join('\n\n');
  docs.push({ slug: `projects/${slug}`, locale, kind: 'doc', title, body: `${intro}\n\n${body}` });
}

const sectionRows = [];
const chunkRows = [];
for (const doc of docs) {
  let position = 0;
  for (const { heading, text } of sections(doc.body, doc.title)) {
    // 1,500자를 넘는 섹션은 문단 경계로 나눠 부모를 여러 개 만든다.
    const parts = doc.kind === 'faq' ? [text] : pack(text, SECTION_MAX, SECTION_MAX);
    parts.forEach((part, i) => {
      const sectionHeading = parts.length > 1 ? `${heading} (${i + 1})` : heading;
      const section = {
        id: hash(doc.slug, doc.locale, sectionHeading, part),
        slug: doc.slug,
        locale: doc.locale,
        kind: doc.kind,
        title: doc.title,
        heading: sectionHeading,
        text: part,
        position: position++,
      };
      sectionRows.push(section);
      // FAQ는 질문 문장 하나가 자식, 문서는 문단·문장 경계로 자른 조각이 자식. 앞에 `문서 제목 > 섹션 제목`을 붙인다.
      const pieces = doc.kind === 'faq' ? [heading] : pack(part, CHUNK_MAX, CHUNK_MIN);
      const seen = new Set();
      for (const piece of pieces) {
        const childText = `${doc.title} > ${sectionHeading}\n${piece}`;
        const id = hash(section.id, childText);
        if (seen.has(id)) continue;
        seen.add(id);
        chunkRows.push({ id, section_id: section.id, slug: doc.slug, locale: doc.locale, kind: doc.kind, text: childText });
      }
    });
  }
}

const q = (v) => (typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, row) => `INSERT INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).map(q).join(', ')});`;
const sql = [
  'DELETE FROM rag_chunks;',
  'DELETE FROM rag_sections;',
  ...sectionRows.map((s) => insert('rag_sections', s)),
  ...chunkRows.map((c) => insert('rag_chunks', c)),
].join('\n');

mkdirSync('.wrangler/tmp', { recursive: true });
const out = '.wrangler/tmp/rag-chunks.sql';
writeFileSync(out, sql);
const lengths = chunkRows.map((c) => c.text.length);
console.log(
  `${docs.length} docs → ${sectionRows.length} sections → ${chunkRows.length} chunks ` +
    `(청크 ${Math.min(...lengths)}–${Math.max(...lengths)}자, ${out})`,
);
if (dry) {
  for (const s of sectionRows) console.log(`  [${s.locale}] ${s.slug} · ${s.heading} (${s.text.length}자, 자식 ${chunkRows.filter((c) => c.section_id === s.id).length})`);
  process.exit(0);
}

execFileSync('wrangler', ['d1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', out, '--yes'], { stdio: 'inherit' });
console.log('배포된 Worker의 /admin/chat → "벡터 갱신"으로 Vectorize를 맞추세요.');
