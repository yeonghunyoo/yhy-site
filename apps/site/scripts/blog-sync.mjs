// 블로그 동기화(docs/08-blog.md "동기화", S-017): Notion "블로그 글" DB의 공개 글 → 정리된 HTML·webp 사진 → R2 blog/.
// 사이트는 R2만 읽는다(src/lib/server/blog.ts). 배포는 필요 없다 — 늦어도 1분 뒤 반영(엣지 캐시).
//
// 사용: pnpm blog:sync            운영 R2에 올린다
//       pnpm blog:sync --dry      올리지 않고 .wrangler/tmp/blog/에 결과만 쓴다
//       pnpm blog:sync --local    wrangler dev의 로컬 R2에 올린다(로컬 확인용)
//       pnpm blog:sync --fixture  Notion 대신 scripts/blog/fixture*.md 두 편(fixture-test, steps-example)으로 — 토큰 없이 확인
// 토큰: 환경변수 NOTION_TOKEN 또는 .env의 NOTION_TOKEN(Notion 내부 통합, 읽기 전용, "bettercurl 블로그" 페이지에만 연결)
// R2 쓰기: wrangler(로그인 또는 CLOUDFLARE_API_TOKEN). 버킷은 wrangler.jsonc의 R2(portfolio-rag)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { checkMeta, renderPost } from './blog/convert.mjs';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const LOCAL = args.has('--local');
const FIXTURE = args.has('--fixture');
const TARGET = DRY ? 'dry' : LOCAL ? '--local' : '--remote';

const BUCKET = readFileSync('wrangler.jsonc', 'utf8').match(/"binding":\s*"R2",\s*"bucket_name":\s*"([^"]+)"/)?.[1] ?? 'portfolio-rag';
const PREFIX = 'blog/';
const DS = process.env.NOTION_BLOG_DS || '2fead265-afa2-40ab-ac6a-54e1ffabcb75'; // "블로그 글" 데이터 소스
const NOTION_VERSION = '2026-03-11';
const IMG = { maxSide: 1600, quality: 80, retryQuality: 65, maxBytes: 1024 * 1024, maxSource: 20 * 1024 * 1024 };
const TMP = '.wrangler/tmp/blog';

// ── 설정 ─────────────────────────────────────────────────
function fromDotEnv(key) {
  if (!existsSync('.env')) return undefined;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.trim().startsWith(`${key}=`));
  return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}
const TOKEN = process.env.NOTION_TOKEN || fromDotEnv('NOTION_TOKEN');
if (!FIXTURE && !TOKEN) {
  console.error('NOTION_TOKEN이 없다 — 환경변수나 apps/site/.env에 넣는다(docs/08-blog.md "Notion"). 토큰 없이 확인하려면 --fixture');
  process.exit(1);
}

// ── R2(wrangler) ─────────────────────────────────────────
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const wrangler = (...a) => execFileSync('wrangler', a, { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

function r2Get(key) {
  if (DRY) return null;
  try {
    return wrangler('r2', 'object', 'get', `${BUCKET}/${key}`, '--pipe', TARGET);
  } catch {
    return null; // 처음이라 없다
  }
}
let writes = 0;
function r2Put(key, body, type) {
  const file = join(TMP, key.replace(/\//g, '__'));
  writeFileSync(file, body);
  if (DRY) return;
  wrangler('r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--content-type', type, TARGET);
  writes++;
}
function r2Delete(key) {
  if (DRY) return;
  try {
    wrangler('r2', 'object', 'delete', `${BUCKET}/${key}`, TARGET);
    writes++;
  } catch {
    /* 이미 없다 */
  }
}

// ── Notion API ───────────────────────────────────────────
async function notion(path, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.notion.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json', ...init.headers },
    });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 1) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Notion ${path} → HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.json();
  }
}
const plain = (rich) => (rich ?? []).map((t) => t.plain_text).join('');

async function listPublished() {
  const out = [];
  let cursor;
  do {
    const r = await notion(`/data_sources/${DS}/query`, {
      method: 'POST',
      body: JSON.stringify({ filter: { property: '공개', checkbox: { equals: true } }, page_size: 100, start_cursor: cursor }),
    });
    for (const p of r.results) {
      const pr = p.properties;
      out.push({
        id: p.id,
        meta: {
          title: plain(pr['제목']?.title).trim(),
          slug: plain(pr.slug?.rich_text).trim(),
          locale: pr['언어']?.select?.name,
          summary: plain(pr['요약']?.rich_text).trim(),
          date: pr['발행일']?.date?.start?.slice(0, 10),
          tags: (pr['태그']?.multi_select ?? []).map((t) => t.name),
          updated: p.last_edited_time,
        },
      });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function pageMarkdown(id) {
  const r = await notion(`/pages/${id}/markdown?markdown_version=v2`);
  if (r.truncated || r.unknown_block_ids?.length) throw new Error(`글이 다 읽히지 않았다(truncated ${r.truncated}, 못 읽은 블록 ${r.unknown_block_ids?.length ?? 0})`);
  return r.markdown;
}

// ── 이미지 ───────────────────────────────────────────────
const prevIndex = (() => {
  const raw = r2Get(`${PREFIX}index.json`);
  try {
    return raw ? JSON.parse(raw.toString('utf8')) : null;
  } catch {
    return null;
  }
})();
const images = { ...(prevIndex?.images ?? {}) }; // hash → { bytes, width, height }
const imageCache = new Map(); // 같은 실행 안에서 같은 원본 주소

async function sourceBytes(src) {
  if (FIXTURE) {
    // 토큰 없이 확인: 원본 대신 회색 판(800×450) — 주소마다 다른 색으로
    const h = createHash('sha256').update(src).digest();
    return sharp({ create: { width: 800, height: 450, channels: 3, background: { r: 40 + (h[0] % 40), g: 44, b: 52 } } }).png().toBuffer();
  }
  if (!/^https:\/\//.test(src)) throw new Error(`내려받을 수 없는 주소: ${src.slice(0, 60)}`);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`이미지 HTTP ${res.status}`);
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > IMG.maxSource) throw new Error(`원본이 너무 크다(${Math.round(len / 1048576)}MB)`);
  return Buffer.from(await res.arrayBuffer());
}

async function resolveImage(src) {
  const key = src.split('?')[0];
  if (imageCache.has(key)) return imageCache.get(key);
  try {
    const input = await sourceBytes(src);
    const pipeline = () => sharp(input, { failOn: 'none' }).rotate().resize({ width: IMG.maxSide, height: IMG.maxSide, fit: 'inside', withoutEnlargement: true });
    let out = await pipeline().webp({ quality: IMG.quality }).toBuffer({ resolveWithObject: true });
    if (out.data.length > IMG.maxBytes) out = await pipeline().webp({ quality: IMG.retryQuality }).toBuffer({ resolveWithObject: true });
    const hash = createHash('sha256').update(out.data).digest('hex').slice(0, 32);
    if (!images[hash]) {
      r2Put(`${PREFIX}img/${hash}.webp`, out.data, 'image/webp');
      images[hash] = { bytes: out.data.length, width: out.info.width, height: out.info.height };
      console.log(`  + 사진 ${hash}.webp ${out.info.width}×${out.info.height} ${Math.round(out.data.length / 1024)}KB`);
    }
    const r = { url: `/blog/img/${hash}.webp`, width: out.info.width, height: out.info.height, hash };
    imageCache.set(key, r);
    return r;
  } catch (e) {
    console.warn(`  ⚠ 사진을 뺐다: ${e.message}`);
    imageCache.set(key, null);
    return null;
  }
}

// ── 본 작업 ──────────────────────────────────────────────
const FIXTURES = {
  fixture: 'scripts/blog/fixture.md',
  steps: 'scripts/blog/fixture-steps.md', // Notion 2열·탭 블록을 다시 읽은 실제 형식(S-020)
};
const entries = FIXTURE
  ? [
      { id: 'fixture', meta: { title: '변환 확인용 글', slug: 'fixture-test', locale: 'ko', summary: 'Notion식 마크다운 변환·사진·표·콜아웃을 확인하는 글이다. 운영에는 올리지 않는다.', date: '2026-11-10', tags: ['Web'], updated: new Date().toISOString() } },
      { id: 'steps', meta: { title: 'Clerk식 단계별 코드 설명 — Notion 2열 블록으로 쓰기', slug: 'steps-example', locale: 'ko', summary: '설명과 코드를 단계마다 나란히 두는 글의 확인용 견본이다. 운영에는 올리지 않는다.', date: '2026-11-10', tags: ['Web'], updated: new Date().toISOString() } },
    ]
  : await listPublished();
console.log(`공개 글 ${entries.length}편 (${DRY ? '확인만' : LOCAL ? '로컬 R2' : `운영 R2 ${BUCKET}`})`);

const keyOf = (m) => `${m.slug}.${m.locale}`;
const counts = new Map();
for (const e of entries) counts.set(keyOf(e.meta), (counts.get(keyOf(e.meta)) ?? 0) + 1);
const prevPosts = new Map((prevIndex?.posts ?? []).map((p) => [keyOf(p), p]));

const posts = [];
let errors = 0;
for (const { id, meta } of entries) {
  const label = `${meta.title || '(제목 없음)'} [${keyOf(meta)}]`;
  const { errors: metaErr, warns } = checkMeta(meta);
  if (counts.get(keyOf(meta)) > 1) metaErr.push('같은 slug·언어의 글이 둘 이상이다');
  if (metaErr.length) {
    errors++;
    console.error(`✗ ${label}: ${metaErr.join(', ')} — 올리지 않는다`);
    // 이미 올라가 있던 글은 그대로 둔다(고칠 때까지 예전 판이 보인다)
    if (prevPosts.has(keyOf(meta))) posts.push(prevPosts.get(keyOf(meta)));
    continue;
  }
  const prev = prevPosts.get(keyOf(meta));
  if (prev && prev.updated === meta.updated && !FIXTURE) {
    posts.push(prev); // Notion에서 바뀌지 않았다
    continue;
  }
  try {
    const md = FIXTURE ? readFileSync(FIXTURES[id], 'utf8') : await pageMarkdown(id);
    const { html, toc, images: used, warnings } = await renderPost(md, { resolveImage });
    const fatal = warnings.filter((w) => w.fatal);
    if (fatal.length) throw new Error(fatal.map((w) => w.msg).join(', '));
    for (const w of [...warns, ...warnings.map((x) => x.msg)]) console.warn(`  △ ${label}: ${w}`);
    const cover = used[0] ? { url: used[0].url, width: used[0].width, height: used[0].height } : undefined;
    const minutes = Math.max(1, Math.round(html.replace(/<[^>]+>/g, '').length / (meta.locale === 'ko' ? 500 : 1100)));
    const post = { ...meta, cover, minutes, images: used.map((u) => u.hash) };
    const body = JSON.stringify({ meta: post, html, toc });
    post.hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
    if (prev?.hash !== post.hash) r2Put(`${PREFIX}posts/${keyOf(meta)}.json`, body, 'application/json');
    posts.push(post);
    console.log(`✓ ${label}${prev ? ' (고침)' : ' (새 글)'}`);
  } catch (e) {
    errors++;
    console.error(`✗ ${label}: ${e.message}`);
    if (prev) posts.push(prev);
  }
}

// 공개가 풀린 글: 목록에서 빼고 글 파일을 지운다(사진은 남긴다 — 정리는 2차 blog:img:gc)
const now = new Set(posts.map(keyOf));
for (const p of prevIndex?.posts ?? []) {
  if (!now.has(keyOf(p))) {
    r2Delete(`${PREFIX}posts/${keyOf(p)}.json`);
    console.log(`- 내림 ${p.title} [${keyOf(p)}]`);
  }
}

// 목록은 마지막에(글·사진이 먼저 올라간 뒤 목록이 바뀐다)
posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
const index = { version: new Date().toISOString(), posts, images };
const changed = JSON.stringify(posts) !== JSON.stringify(prevIndex?.posts ?? []) || Object.keys(images).length !== Object.keys(prevIndex?.images ?? {}).length;
if (changed || !prevIndex) r2Put(`${PREFIX}index.json`, JSON.stringify(index), 'application/json');

const total = Object.values(images).reduce((t, i) => t + i.bytes, 0);
console.log(
  `\n글 ${posts.length}편 · 사진 ${Object.keys(images).length}장 ${(total / 1048576).toFixed(1)}MB (R2 무료 10GB의 ${((total / (10 * 1024 ** 3)) * 100).toFixed(3)}%) · R2 쓰기 ${writes}회 · 오류 ${errors}`,
);
// GitHub Actions(S-018): 바뀐 게 있을 때만 다음 단계(SEO 점검)를 돌린다
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `changed=${changed && !DRY ? 'true' : 'false'}\n`, { flag: 'a' });
if (DRY) console.log(`확인만 — 결과: ${TMP}/`);
else if (!LOCAL && changed) console.log('운영 반영: 늦어도 1분 뒤. 확인 → pnpm seo:check --url https://bettercurl.dev');
process.exit(errors ? 1 : 0);
