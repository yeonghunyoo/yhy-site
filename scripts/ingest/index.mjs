// RAG 문서 가져오기 — 원본(PDF·마크다운)을 검토용 마크다운 초안으로 바꾸고, 원본과 이미지는 R2에 올린다.
// 설계: docs/06-ingest.md. 결과는 src/content/rag/{slug}.{locale}.md — 사람이 읽고 고친 뒤 커밋하고 pnpm rag:build로 넣는다.
// 사용: pnpm rag:import                         rag-sources/의 지원 파일 전부({slug}.{ko|en}.{pdf|md})
//       pnpm rag:import rag-sources/about.ko.pdf
//       pnpm rag:import 이력서.pdf --slug about --locale ko
//       --force      같은 이름의 초안이 있어도 덮어쓴다
//       --no-upload  R2에 올리지 않는다(미리보기·로그인 없는 환경). 이미지는 .wrangler/tmp/ingest/media/에만
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parse, supportedExtensions } from './registry.mjs';
import { createStore, rewriteImageRefs, sha256 } from './store.mjs';

const SOURCE_DIR = 'rag-sources';
const OUT_DIR = 'src/content/rag';
const IMPORT_MARK = 'rag-import:'; // rag-build가 이 표시가 남은 문서를 경고하고, --remote에서는 멈춘다
const MAX_BYTES = 20 * 1024 * 1024;
const SOURCE_MIME = { '.pdf': 'application/pdf', '.md': 'text/markdown' };
// 문서 안에 숨은 지시문(간접 주입)으로 보이는 문장. 넣기 전에 사람이 보도록 표시만 한다.
const SUSPICIOUS = /(무시|잊어|따르지\s*마|ignore|disregard|override)[^.\n]{0,30}(지시|지침|규칙|프롬프트|instructions?|rules?|prompts?)|(시스템|개발자)\s*프롬프트|system\s*prompt|you are now|너는 이제/i;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const force = flag('--force');
const upload = !flag('--no-upload');
const slugArg = option('--slug');
const localeArg = option('--locale');
const files = argv.filter((a, i) => !a.startsWith('--') && !['--slug', '--locale'].includes(argv[i - 1]));

/** 초안의 frontmatter에서 원본 해시를 읽는다(같은 원본이면 다시 만들지 않는다). */
const draftHash = (path) => readFileSync(path, 'utf8').match(/^source:.*\bhash:\s*([0-9a-f]+)/m)?.[1];

async function importFile(file, store) {
  const name = basename(file);
  const ext = extname(name).toLowerCase();
  const match = name.match(/^(.+)\.(ko|en)\.[a-z]+$/i);
  const slug = slugArg ?? match?.[1];
  const locale = (localeArg ?? match?.[2])?.toLowerCase();
  if (!slug || !['ko', 'en'].includes(locale)) return console.error(`건너뜀 ${file} — 이름을 {slug}.ko${ext} / {slug}.en${ext}로 하거나 --slug, --locale을 준다`);
  const out = join(OUT_DIR, `${slug}.${locale}.md`);
  if (resolve(file) === resolve(out)) return console.error(`건너뜀 ${file} — 이미 넣기 대상 문서다. 원본은 ${SOURCE_DIR}/에 둔다`);
  if (statSync(file).size > MAX_BYTES) return console.error(`건너뜀 ${file} — 20MB를 넘는다`);

  const data = new Uint8Array(readFileSync(file));
  const hash = sha256(data);
  if (existsSync(out) && !force) {
    if (draftHash(out) === hash) return console.log(`그대로 ${file} — 같은 원본으로 만든 ${out}이 있다`);
    return console.error(`건너뜀 ${file} — ${out}이 이미 있다(덮어쓰려면 --force)`);
  }

  // pdf.js는 받은 버퍼를 워커로 넘겨 비운다 — 원본 저장에 쓸 수 있게 복사본을 준다.
  const result = await parse(data.slice(), file).catch((error) => {
    console.error(`실패 ${file} — ${error.message}`);
    return null;
  });
  if (!result) return;
  store.source(data, SOURCE_MIME[ext]);
  const body = rewriteImageRefs(result.markdown, result.images, store);
  const { title, parser, pageCount, scannedPages = [] } = result.metadata;
  const pages = pageCount ? `, pages: ${pageCount}` : '';
  const md = [
    '---',
    `title: ${title || slug}`,
    `source: { file: ${name}, hash: ${hash}, parser: ${parser}${pages} }`,
    '---',
    '',
    `<!-- ${IMPORT_MARK} ${name}${pageCount ? ` (${pageCount}쪽)` : ''}에서 자동 변환. 확인하고 이 주석을 지운다: ## 제목 위치, 표, 줄바꿈, 개인정보(연락처·주소), 이미지(개인정보가 담긴 이미지는 줄째 지우고 대체 텍스트는 내용으로 고친다), 문서 안의 지시문 -->`,
    '',
    body,
    '',
  ].join('\n');
  writeFileSync(out, md);

  const headings = body.split('\n').filter((l) => l.startsWith('## ')).length;
  const chars = body.replace(/<!--[\s\S]*?-->|!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s/g, '').length;
  const parts = [pageCount && `${pageCount}쪽`, `${chars}자`, `## 제목 ${headings}개${headings ? '' : ' — 제목을 못 찾았다. 직접 ## 을 넣는다'}`, `이미지 ${result.images.length}개`];
  console.log(`${file} → ${out} (${parts.filter(Boolean).join(', ')})`);
  if (scannedPages.length) console.warn(`  스캔 쪽 ${scannedPages.join(', ')} — 글자가 없어 넣지 않았다(OCR은 2차)`);
  for (const line of body.split('\n').filter((l) => SUSPICIOUS.test(l))) console.warn(`  지시문 의심: ${line.slice(0, 80)}`);
}

const exts = supportedExtensions();
const targets = files.length
  ? files
  : existsSync(SOURCE_DIR)
    ? readdirSync(SOURCE_DIR).filter((n) => exts.includes(extname(n).toLowerCase())).map((n) => join(SOURCE_DIR, n))
    : [];
if (!targets.length) console.error(`가져올 파일이 없다. ${SOURCE_DIR}/{slug}.{ko|en}.{${exts.map((e) => e.slice(1)).join('|')}} 로 넣거나 경로를 준다`);
if ((slugArg || localeArg) && targets.length > 1) {
  console.error('--slug, --locale은 파일 하나에만 쓴다');
  process.exit(1);
}

const store = createStore({ upload });
for (const file of targets) await importFile(file, store);
const uploaded = store.finish();
console.log(upload ? `R2 업로드 ${uploaded}건` : 'R2에 올리지 않았다(--no-upload) — 이미지는 .wrangler/tmp/ingest/media/');
