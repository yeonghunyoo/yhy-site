// RAG 문서 번역 — src/content/rag/{slug}.ko.md → {slug}.en.md를 Workers AI(REST)로 만든다.
// 설계: docs/05-06-chat-rag.md "영어 문서 자동 번역". 넣기(rag:build)는 그대로 — 만든 .en.md를 다른 문서처럼 읽는다.
//
// 사용: pnpm rag:translate [slug ...] [--force] [--dry]
//   slug 없이: 모든 .ko.md 중 번역이 필요한 것만
//   --force: 원문이 그대로여도 자동 번역본을 다시 만든다(손으로 쓴 영어 문서는 여전히 건드리지 않는다)
//   --dry: 번역할 문서와 묶음만 출력하고 모델을 부르지 않는다
// 환경변수: CLOUDFLARE_API_TOKEN(Workers AI 권한), CLOUDFLARE_ACCOUNT_ID. 선택: RAG_TRANSLATE_MODEL, RAG_TRANSLATE_NEURON_CAP
//
// 자동 번역본은 frontmatter 바로 뒤에 표시 주석이 붙는다:
//   <!-- rag-translate: from=resume.ko.md sha=… model=… -->
// - 원문 해시가 같으면 건너뛴다(다시 부르지 않는다)
// - 표시 주석이 없는 .en.md는 사람이 쓴 문서로 보고 덮어쓰지 않는다. 번역본을 손으로 고쳐 굳히려면 이 주석을 지운다
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/content/rag';
const MODEL = process.env.RAG_TRANSLATE_MODEL || '@cf/google/gemma-4-26b-a4b-it';
// 한 번 실행에 쓰는 뉴런 상한(계정 하루 무료 1만, 사이트 챗 상한 8,000과 나눠 쓴다 — docs/guides/cost-guard.md).
// 지금 문서 전체(약 2만 자) 번역이 약 100~200뉴런.
const NEURON_CAP = Number(process.env.RAG_TRANSLATE_NEURON_CAP || 1500);
const GROUP_MAX = 2500; // 한 번에 보내는 원문 글자 수(섹션 단위로 묶는다)

const args = process.argv.slice(2);
const force = args.includes('--force');
const dry = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('--'));

// 고유명사 — 모델이 음역하거나 뜻으로 풀지 않게 고정한다. 기존 영어 문서(about.en.md 등)와 같은 표기.
const GLOSSARY = [
  ['유영훈', 'Yeonghun Yoo'],
  ['클러쉬(주)', 'Clush'],
  ['트립에이드', 'Tripaid'],
  ['헬미닥', 'Helmidak'],
  ['홀리츠', 'holich'],
  ['(주)알파이글루', 'Alpha Igloo'],
  ['클락', 'Clark'],
  ['반도체사', 'a semiconductor company (client)'],
];

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const markSha = (text) => text.match(/<!--\s*rag-translate:[^>]*\bsha=([0-9a-f]+)/)?.[1];

function splitFrontmatter(source) {
  const m = source.match(/^---\n([\s\S]*?)\n---\n?/);
  return m ? { fm: m[1], body: source.slice(m[0].length) } : { fm: '', body: source };
}

/** 본문을 `##` 섹션으로 나누고 GROUP_MAX 안에서 묶는다. 쪽 표시 외 주석(작성 메모)은 빼고 보낸다 — rag:build도 지운다. */
function groups(body) {
  const clean = body.replace(/<!--(?!\s*page:\d+\s*-->)[\s\S]*?-->\n?/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const sections = [];
  let buf = [];
  for (const line of clean.split('\n')) {
    if (/^##\s/.test(line) && buf.length) {
      sections.push(buf.join('\n').trim());
      buf = [];
    }
    buf.push(line);
  }
  if (buf.length) sections.push(buf.join('\n').trim());
  const out = [];
  for (const s of sections.filter(Boolean)) {
    const last = out.at(-1);
    if (last && last.length + s.length + 2 <= GROUP_MAX) out[out.length - 1] = `${last}\n\n${s}`;
    else out.push(s);
  }
  return out;
}

const SYSTEM = `You translate Korean Markdown documents about a software engineer's portfolio into natural, concise English.
Rules:
- Output only the translated Markdown. No preface, no notes, no code fences around the output.
- Keep the Markdown structure exactly: the same headings (## / ###) in the same order, lists, tables (same number of rows and columns), bold, line breaks.
- Keep every placeholder like ⟦0⟧, ⟦12⟧ exactly as is, in the same place (they stand for links, emails and page markers). Keep unchanged: file paths, code, numbers, dates, version strings, product and library names written in Latin letters.
- Translate image alt text inside ![...].
- Refer to the person as "Yeonghun Yoo" or "Yeonghun" (유영훈 is the real name; "yhy" is only the site name); never use he/she pronouns — rephrase or use "they" only if unavoidable. First-person Korean ("저는") becomes first person ("I"). A Korean sentence without a subject keeps the subject the source implies — never invent "I" for Yeonghun where the source names Yeonghun.
- Use these fixed names: ${GLOSSARY.map(([k, v]) => `${k} → ${v}`).join('; ')}.
- Do not add facts, do not drop sentences, do not summarize.`;

const tokenOf = () => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    console.error('CLOUDFLARE_API_TOKEN·CLOUDFLARE_ACCOUNT_ID가 필요하다(Workers AI 권한 토큰).');
    process.exit(1);
  }
  return { token, account };
};

let neurons = 0;
async function run(messages, maxTokens) {
  const { token, account } = tokenOf();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.2, chat_template_kwargs: { enable_thinking: false } }),
    });
    const json = await res.json().catch(() => ({}));
    // 용량 초과(3040)는 잠깐 쉬고 다시. 그 밖의 오류는 멈춘다.
    if (!res.ok || !json.success) {
      const capacity = JSON.stringify(json.errors ?? '').includes('3040');
      if (capacity && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw new Error(`Workers AI HTTP ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
    }
    const r = json.result;
    neurons += r.usage?.neurons ?? 0;
    const text = r.choices?.[0]?.message?.content ?? r.response ?? '';
    const finish = r.choices?.[0]?.finish_reason;
    return { text: text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/, '$1').trim(), finish };
  }
}

// 모델이 바꾸면 안 되는 것(URL·메일·쪽 표시)은 보내기 전에 자리표 ⟦n⟧로 바꾸고 받은 뒤 되돌린다.
// 해시 이름 이미지 경로를 모델이 한두 글자 틀리게 옮기는 일이 있었다(11/04).
const PROTECT = /<!--\s*page:\d+\s*-->|(?:https?:\/\/|\/media\/)[^\s)>\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|github\.com\/[\w./-]+/g;
function protect(text) {
  const kept = [];
  const out = text.replace(PROTECT, (m) => `⟦${kept.push(m) - 1}⟧`);
  return { out, kept };
}
const restore = (text, kept) => text.replace(/⟦(\d+)⟧/g, (m, i) => kept[Number(i)] ?? m);

/** 번역이 구조를 지켰는지 본다 — 제목 수, 표 행 수, 이미지 수, 자리표, 잘림. 문제 목록을 돌려준다. */
function check(src, out, finish, kept) {
  const problems = [];
  if (finish === 'length') problems.push('출력이 잘림');
  const count = (re, s) => (s.match(re) ?? []).length;
  for (const [name, re] of [
    ['## 제목', /^##\s/gm],
    ['### 제목', /^###\s/gm],
    ['표 행', /^\|/gm],
    ['이미지', /!\[[^\]]*\]\([^)]+\)/g],
  ]) {
    const a = count(re, src);
    const b = count(re, out);
    if (a !== b) problems.push(`${name} ${a} → ${b}`);
  }
  for (let i = 0; i < kept.length; i++) if (!out.includes(`⟦${i}⟧`)) problems.push(`빠진 자리표 ⟦${i}⟧ ${kept[i]}`);
  // 고유명사 괄호 병기 "Yeonghun Yoo (유영훈)" 정도는 허용 — 한글이 많이 남으면 번역 누락으로 본다.
  const hangul = count(/[가-힣]/g, out);
  if (hangul > 20) problems.push(`한글 ${hangul}자 남음`);
  return problems;
}

async function translateGroup(text) {
  const { out: masked, kept } = protect(text);
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: masked },
  ];
  // 영어는 대략 한글 글자 수의 0.6~0.9토큰 — 넉넉히.
  const maxTokens = Math.min(4000, Math.ceil(masked.length * 1.2) + 200);
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text: out, finish } = await run(messages, maxTokens);
    const problems = check(masked, out, finish, kept);
    if (!problems.length) return restore(out, kept);
    last = problems;
    console.warn(`  다시 시도 — ${problems.join(', ')}`);
  }
  throw new Error(`번역 검사 실패: ${last.join(', ')}`);
}

async function translateTitle(title) {
  const { text } = await run(
    [
      { role: 'system', content: `${SYSTEM}\n- The input is a single document title. Output one line only.` },
      { role: 'user', content: title },
    ],
    80,
  );
  return text.split('\n')[0].replace(/^#+\s*/, '').replace(/^["']|["']$/g, '').trim();
}

// 대상 고르기
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith('.ko.md'))
  .map((f) => f.slice(0, -'.ko.md'.length))
  .filter((slug) => !only.length || only.includes(slug));
if (only.length) for (const slug of only) if (!sources.includes(slug)) console.warn(`없는 문서: ${slug}.ko.md`);

const todo = [];
for (const slug of sources) {
  const src = readFileSync(join(DIR, `${slug}.ko.md`), 'utf8');
  const target = join(DIR, `${slug}.en.md`);
  const hash = sha(src);
  if (existsSync(target)) {
    const current = readFileSync(target, 'utf8');
    const prev = markSha(current);
    if (!prev) {
      if (only.includes(slug)) console.log(`건너뜀 ${slug}: ${slug}.en.md는 손으로 쓴 문서(표시 주석 없음) — 다시 만들려면 파일을 지운다`);
      continue;
    }
    if (prev === hash && !force) {
      console.log(`최신 ${slug}.en.md`);
      continue;
    }
  }
  todo.push({ slug, src, hash, target });
}

if (!todo.length) {
  console.log('번역할 문서가 없다.');
  process.exit(0);
}

for (const doc of todo) {
  const { fm, body } = splitFrontmatter(doc.src);
  const parts = groups(body);
  console.log(`${doc.slug}.ko.md → ${doc.slug}.en.md (${body.length}자, ${parts.length}묶음)`);
  if (dry) continue;

  try {
    // frontmatter: title만 번역하고 나머지 줄(source 등)은 그대로 둔다.
    const fmLines = [];
    for (const line of fm.split('\n')) {
      const t = line.match(/^title:\s*(.*)$/);
      fmLines.push(t ? `title: ${await translateTitle(t[1].replace(/^['"]|['"]$/g, ''))}` : line);
    }
    const out = [];
    for (const [i, part] of parts.entries()) {
      if (neurons > NEURON_CAP) throw new Error(`뉴런 상한 ${NEURON_CAP} 도달 — RAG_TRANSLATE_NEURON_CAP로 올리거나 나눠 돌린다`);
      process.stdout.write(`  ${i + 1}/${parts.length} `);
      out.push(await translateGroup(part));
      console.log('ok');
    }
    const fmBlock = fm ? `---\n${fmLines.join('\n')}\n---\n\n` : '';
    const mark = `<!-- rag-translate: from=${doc.slug}.ko.md sha=${doc.hash} model=${MODEL} — 자동 번역(pnpm rag:translate). 원문을 고치면 다시 돌린다. 손으로 고쳐 굳히려면 이 줄을 지운다 -->\n\n`;
    writeFileSync(doc.target, `${fmBlock}${mark}${out.join('\n\n')}\n`);
    console.log(`  저장 ${doc.target}`);
  } catch (error) {
    console.error(`  실패 ${doc.slug}: ${error.message} — 파일은 바꾸지 않았다`);
    process.exitCode = 1;
  }
}
if (!dry) console.log(`뉴런 약 ${neurons.toFixed(1)} 사용`);
