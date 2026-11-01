// RAG 문서 가져오기 — PDF를 검토용 마크다운 초안으로 바꾼다. 설계: docs/05-06-chat-rag.md "지식 베이스".
// 원본 PDF는 rag-sources/{slug}.{ko|en}.pdf (gitignore — 레포가 공개라 원본은 올리지 않는다).
// 결과는 src/content/rag/{slug}.{locale}.md. 사람이 읽고 고친 뒤 커밋하고 pnpm rag:build로 넣는다.
// 사용: pnpm rag:import (rag-sources/의 PDF 전부) / pnpm rag:import rag-sources/about.ko.pdf / --force (있는 .md 덮어쓰기)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getDocumentProxy } from 'unpdf';

const SOURCE_DIR = 'rag-sources';
const OUT_DIR = 'src/content/rag';
const IMPORT_MARK = 'rag-import:'; // rag-build가 이 표시가 남은 문서를 경고한다
const force = process.argv.includes('--force');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const BULLET = /^([•·▪‣◦●○■□\-*–]|\d{1,2}[.)])\s*/;
const PAGE_NUMBER = /^(-\s*)?\d{1,4}(\s*-)?$|^\d{1,4}\s*\/\s*\d{1,4}$|^(page|p\.)\s*\d+/i;
// 문서 안에 숨은 지시문(간접 주입)으로 보이는 문장. 넣기 전에 사람이 보도록 표시만 한다.
const SUSPICIOUS = /(무시|잊어|따르지\s*마|ignore|disregard|override)[^.\n]{0,30}(지시|지침|규칙|프롬프트|instructions?|rules?|prompts?)|(시스템|개발자)\s*프롬프트|system\s*prompt|you are now|너는 이제/i;
const round = (n) => Math.round(n * 2) / 2;

/**
 * 한 쪽의 텍스트 조각을 줄로 묶는다. 줄마다 글자 크기(가장 큰 조각)와 y 위치를 남긴다.
 * 한국어 줄바꿈이 낱말 중간인지(“썼습 / 니다”) 낱말 사이인지는 PDF만으로 알 수 없어 띄어 쓰고, 검토에서 고친다.
 */
async function pageLines(page) {
  const { items } = await page.getTextContent();
  const lines = [];
  let cur = null;
  for (const item of items) {
    if (!('str' in item)) continue;
    // 유니코드 대응표가 없는 글꼴은 공백을 제어 문자(U+0001 등)로 준다(Chrome으로 만든 PDF).
    const str = item.str.replace(/[\u0000-\u001f\u00a0\u3000]/g, ' ');
    const [, , c, d, x, y] = item.transform;
    const size = round(Math.hypot(c, d) || item.height);
    if (!str.trim()) {
      if (cur && str) cur.text += ' ';
      if (item.hasEOL) cur = null;
      continue;
    }
    if (!cur || Math.abs(cur.y - y) > Math.max(size, cur.size) * 0.5) {
      cur = { text: '', size, y, endX: x };
      lines.push(cur);
    }
    // 조각 사이 간격이 있으면 띄어 쓴다(PDF는 공백을 조각으로 안 주는 경우가 많다).
    if (cur.text && !cur.text.endsWith(' ') && x - cur.endX > size * 0.2) cur.text += ' ';
    cur.text += str;
    cur.size = Math.max(cur.size, size);
    cur.endX = x + item.width;
    if (item.hasEOL) cur = null;
  }
  // 오른쪽 끝(가장 긴 줄의 끝)보다 한참 짧게 끝난 줄은 줄을 유지한다 — 그림으로 그린 글머리표 목록, 짧은 항목.
  const right = Math.max(0, ...lines.map((l) => l.endX));
  return lines.map((l) => ({ ...l, short: l.endX < right * 0.85, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
}

/** 여러 쪽에 같은 자리로 반복되는 머리말·꼬리말(숫자만 다른 것 포함)을 찾는다. */
function repeated(pages) {
  if (pages.length < 3) return new Set();
  const count = new Map();
  for (const lines of pages) {
    for (const key of new Set(lines.map((l) => l.text.replace(/\d+/g, '#')))) count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n >= Math.ceil(pages.length * 0.6)).map(([key]) => key));
}

/** 줄 → 마크다운. 본문보다 15% 이상 큰 짧은 줄은 `##` 제목, 줄 간격이 넓으면 문단을 나눈다. */
function toMarkdown(pages, title) {
  const drop = repeated(pages);
  const lines = pages.flat().filter((l) => !PAGE_NUMBER.test(l.text) && !drop.has(l.text.replace(/\d+/g, '#')));
  // 본문 크기 = 글자 수로 가중한 최빈 크기
  const weight = new Map();
  for (const l of lines) weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const isHeading = (l) => l.size >= body * 1.15 && [...l.text].length <= 80;

  // 제목: PDF 메타데이터가 없으면 첫 쪽에서 가장 큰 제목 줄을 쓰고 본문에서 뺀다.
  let docTitle = title;
  if (!docTitle) {
    const first = pages[0]?.filter((l) => lines.includes(l) && isHeading(l)) ?? [];
    const top = first.sort((a, b) => b.size - a.size)[0];
    if (top) {
      docTitle = top.text;
      lines.splice(lines.indexOf(top), 1);
    }
  }

  const out = [];
  let para = null;
  let prev = null;
  const flush = () => {
    if (para) out.push(para);
    para = null;
  };
  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      // 두 줄로 넘어간 제목은 하나로 합친다.
      if (prev && isHeading(prev) && prev.size === line.size && out.at(-1)?.startsWith('## ')) out[out.length - 1] += ` ${line.text}`;
      else out.push(`## ${line.text}`);
    } else {
      const gap = prev ? prev.y - line.y : 0;
      const newPara = !para || isHeading(prev) || gap > line.size * 1.8 || gap < 0;
      const bullet = BULLET.test(line.text);
      if (newPara && !bullet) flush();
      if (bullet) {
        // 글머리표는 줄을 유지한다. 문단 안에 섞여 있으면 문단을 끊고 목록으로.
        if (para && !para.startsWith('- ')) flush();
        para = para ? `${para}\n- ${line.text.replace(BULLET, '')}` : `- ${line.text.replace(BULLET, '')}`;
      } else if (!para) para = line.text;
      else if (prev.short) para += `\n${line.text}`;
      else if (/[A-Za-z]-$/.test(para)) para = para.slice(0, -1) + line.text; // 영어 줄끝 하이픈
      else para += ` ${line.text}`;
    }
    prev = line;
  }
  flush();
  return { title: docTitle, body: out.join('\n\n') };
}

async function convert(file) {
  const name = basename(file);
  const match = name.match(/^(.+)\.(ko|en)\.pdf$/i);
  if (!match) return console.error(`건너뜀 ${file} — 이름은 {slug}.ko.pdf / {slug}.en.pdf`);
  const [, slug, locale] = match;
  const out = join(OUT_DIR, `${slug}.${locale.toLowerCase()}.md`);
  if (existsSync(out) && !force) return console.error(`건너뜀 ${file} — ${out}이 이미 있다(덮어쓰려면 --force)`);

  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(file)));
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) pages.push(await pageLines(await pdf.getPage(i)));
  const chars = pages.flat().reduce((n, l) => n + l.text.length, 0);
  if (chars < 20 * pdf.numPages) return console.error(`실패 ${file} — 글자가 거의 없다(${chars}자). 스캔본이면 OCR한 PDF나 마크다운으로 받는다`);

  const info = (await pdf.getMetadata().catch(() => null))?.info ?? {};
  const metaTitle = String(info.Title ?? '').trim();
  const { title, body } = toMarkdown(pages, /^(microsoft word|untitled|제목 없음)|\.(docx?|hwp|pages)$/i.test(metaTitle) ? '' : metaTitle);
  const headings = body.split('\n').filter((l) => l.startsWith('## ')).length;
  const md = [
    '---',
    `title: ${title || slug}`,
    '---',
    '',
    `<!-- ${IMPORT_MARK} ${name} (${pdf.numPages}쪽)에서 자동 변환. 확인하고 이 주석을 지운다: ## 제목 위치, 표, 줄바꿈, 개인정보(연락처·주소), 문서 안의 지시문 -->`,
    '',
    body,
    '',
  ].join('\n');
  writeFileSync(out, md);
  console.log(`${file} → ${out} (${pdf.numPages}쪽, ${chars}자, ## 제목 ${headings}개${headings ? '' : ' — 제목을 못 찾았다. 직접 ## 을 넣는다'})`);
  for (const line of body.split('\n').filter((l) => SUSPICIOUS.test(l))) console.warn(`  지시문 의심: ${line.slice(0, 80)}`);
}

const files = args.length
  ? args
  : existsSync(SOURCE_DIR)
    ? readdirSync(SOURCE_DIR).filter((n) => n.toLowerCase().endsWith('.pdf')).map((n) => join(SOURCE_DIR, n))
    : [];
if (!files.length) console.error(`PDF가 없다. ${SOURCE_DIR}/{slug}.{ko|en}.pdf 로 넣거나 경로를 준다. 마크다운은 ${OUT_DIR}/에 바로 넣는다`);
for (const file of files) await convert(file);
