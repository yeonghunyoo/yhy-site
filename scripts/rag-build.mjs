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

const PAGE_MARK = '\u0000page:';
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
// 이미지는 청킹 동안 자리표 \u0001{번호}\u0001로 두었다가, 텍스트에는 대체 텍스트만 남기고 URL은 섹션 메타로 모은다.
const IMAGE_TOKEN = /\u0001(\d+)\u0001/g;

const hash = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24);

/** 아주 단순한 frontmatter 파서(title, summary, stack만 쓴다). frontmatter에 title이 없으면 첫 `#` 제목을 쓴다. */
function parse(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (match) {
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^(title|summary|stack):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].replace(/^\[|\]$/g, '').replace(/^['"]|['"]$/g, '');
    }
  }
  // 쪽 표시(<!-- page:N -->, rag:import가 넣는다)는 줄로 남기고 나머지 주석은 지운다. 이미지는 sections()가 다룬다.
  const body = (match ? source.slice(match[0].length) : source)
    .replace(/<!--\s*page:(\d+)\s*-->/g, `${PAGE_MARK}$1`)
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  meta.title ??= body.match(/^#\s+(.+)$/m)?.[1].trim();
  return { meta, body };
}

/**
 * `##` 제목 단위로 나눈다. 첫 제목 앞 본문은 문서 제목을 섹션 제목으로 쓴다. `#`은 버리고 `###` 이하는 본문에 남긴다.
 * 섹션마다 시작 쪽(쪽 표시가 있는 문서만)과 이미지 목록을 함께 돌려준다. 이미지는 본문에서 자리표로 바꿔 둔다.
 */
function sections(body, title) {
  const out = [];
  let heading = title;
  let buf = [];
  let page = null;
  let startPage = null;
  let images = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) out.push({ heading, text, page: startPage, images });
    buf = [];
    images = [];
    startPage = null;
  };
  for (const line of body.split('\n')) {
    if (line.startsWith(PAGE_MARK)) {
      page = Number(line.slice(PAGE_MARK.length));
      continue;
    }
    if (/^#\s/.test(line)) continue;
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
      startPage = page;
      continue;
    }
    if (!buf.length && startPage === null) startPage = page;
    buf.push(
      line.replace(IMAGE, (_, alt, url) => {
        images.push({ alt: alt.trim(), url });
        return `\u0001${images.length - 1}\u0001`;
      }),
    );
  }
  flush();
  return out;
}

/** 자리표를 대체 텍스트로 바꾸고, 그 조각에 들어 있던 이미지 URL을 모은다. */
function resolveImages(text, images) {
  const urls = [];
  const clean = text.replace(IMAGE_TOKEN, (_, i) => {
    urls.push(images[Number(i)].url);
    return images[Number(i)].alt;
  });
  return { text: clean, urls };
}

/** 마크다운 표(| 로 시작하는 줄)가 max를 넘으면 행 단위로 나누고 머리 행(+구분 줄)을 조각마다 반복한다. */
function tableUnits(lines, max) {
  const head = /^\|?\s*:?-{3,}/.test(lines[1] ?? '') ? lines.slice(0, 2) : lines.slice(0, 1);
  const rows = lines.slice(head.length);
  const out = [];
  let cur = [];
  for (const row of rows) {
    if (cur.length && [...head, ...cur, row].join('\n').length > max) {
      out.push([...head, ...cur].join('\n'));
      cur = [];
    }
    cur.push(row);
  }
  if (cur.length || !out.length) out.push([...head, ...cur].join('\n'));
  return out.map((text) => ({ text: text.slice(0, max), paraEnd: true }));
}

/** 문단 → 문장 순으로 쪼갠 조각 */
function units(text) {
  const out = [];
  for (const para of text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    const lines = para.split('\n');
    if (para.length <= CHUNK_MAX) out.push({ text: para, paraEnd: true });
    else if (lines.every((l) => l.trim().startsWith('|'))) out.push(...tableUnits(lines, CHUNK_MAX));
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
const unreviewed = [];
const ragDir = 'src/content/rag';
for (const file of mdFiles(ragDir)) {
  const match = relative(ragDir, file).match(/^(.+)\.(ko|en)\.md$/);
  if (!match) continue;
  const [, slug, locale] = match;
  const source = readFileSync(file, 'utf8');
  // rag:import로 만든 PDF 변환본은 검토 표시(주석)를 지워야 검토가 끝난 것으로 본다.
  if (source.includes('rag-import:')) unreviewed.push(file);
  const { meta, body } = parse(source);
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

// 검토 전 문서(rag-import 주석이 남은 것): 로컬은 경고만, 운영(--remote)은 넣지 않고 멈춘다.
for (const file of unreviewed) console.warn(`검토 전 문서: ${file} — 변환 결과를 확인하고 rag-import 주석을 지운다`);
if (unreviewed.length && remote) {
  console.error('검토 전 문서가 있어 운영 D1에 넣지 않는다.');
  process.exit(1);
}

const sectionRows = [];
const chunkRows = [];
for (const doc of docs) {
  let position = 0;
  for (const { heading, text, page, images } of sections(doc.body, doc.title)) {
    // 1,500자를 넘는 섹션은 문단 경계로 나눠 부모를 여러 개 만든다.
    const parts = doc.kind === 'faq' ? [text] : pack(text, SECTION_MAX, SECTION_MAX);
    parts.forEach((raw, i) => {
      const sectionHeading = parts.length > 1 ? `${heading} (${i + 1})` : heading;
      const { text: part, urls } = resolveImages(raw, images);
      const section = {
        id: hash(doc.slug, doc.locale, sectionHeading, part),
        slug: doc.slug,
        locale: doc.locale,
        kind: doc.kind,
        title: doc.title,
        heading: sectionHeading,
        text: part,
        position: position++,
        page,
        images: urls.length ? urls : null,
      };
      sectionRows.push(section);
      // FAQ는 질문 문장 하나가 자식, 문서는 문단·문장 경계로 자른 조각이 자식. 앞에 `문서 제목 > 섹션 제목`을 붙인다.
      const pieces = doc.kind === 'faq' ? [heading] : pack(raw, CHUNK_MAX, CHUNK_MIN).map((p) => resolveImages(p, images).text);
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

const q = (v) =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${(Array.isArray(v) ? JSON.stringify(v) : String(v)).replace(/'/g, "''")}'`;
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
  for (const s of sectionRows) {
    const extra = [s.page && `p${s.page}`, s.images && `이미지 ${s.images.length}`].filter(Boolean).join(', ');
    console.log(`  [${s.locale}] ${s.slug} · ${s.heading} (${s.text.length}자, 자식 ${chunkRows.filter((c) => c.section_id === s.id).length}${extra ? `, ${extra}` : ''})`);
  }
  process.exit(0);
}

execFileSync('wrangler', ['d1', 'execute', 'DB', remote ? '--remote' : '--local', '--file', out, '--yes'], { stdio: 'inherit' });
console.log('배포된 Worker의 /admin/chat → "벡터 갱신"으로 Vectorize를 맞추세요.');
