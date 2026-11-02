// PDF 파서 — 텍스트는 줄로 묶어 마크다운으로, 삽입 이미지는 픽셀로 꺼내 쪽 본문 뒤에 넣는다.
// 설계: docs/06-ingest.md "2. PDF 파서". 쪽 분류·이미지 필터 기준은 WeKnora docreader pdf_parser.py를 따른다.
import { createHash } from 'node:crypto';
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import { encodePixels } from '../image.mjs';

const BULLET = /^([•·▪‣◦●○■□\-*–]|\d{1,2}[.)])\s*/;
const PAGE_NUMBER = /^(-\s*)?\d{1,4}(\s*-)?$|^\d{1,4}\s*\/\s*\d{1,4}$|^(page|p\.)\s*\d+/i;
const round = (n) => Math.round(n * 2) / 2;

// 쪽 분류와 이미지 필터(docreader 기준)
const SCAN_IMAGE_RATIO = 0.5; // 이미지가 쪽의 50% 이상이면 스캔 쪽
const SCAN_FEW_CHARS = 10; // 글자 10자 미만이고
const SCAN_FEW_CHARS_RATIO = 0.1; // 이미지가 10% 이상이어도 스캔 쪽
const IMAGE_MIN_AREA = 0.01; // 쪽 면적 1% 미만은 버린다(아이콘·장식)
const IMAGE_MIN_PX = 80;
const LOGO_PAGE_RATIO = 0.5; // 텍스트 쪽의 50% 이상에 같은 이미지가 나오면 로고·워터마크
const IMAGE_MAX = 50;

export const MAX_PAGES = 100;

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
    const str = item.str.replace(/[\u0000-\u001f 　]/g, ' ');
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
  // 쪽 위·아래 10% 안의 줄만 머리말·꼬리말·쪽 번호 후보로 본다.
  const [, y0, , y1] = page.view;
  const edge = (y) => y > y1 - (y1 - y0) * 0.1 || y < y0 + (y1 - y0) * 0.1;
  return lines
    .map((l) => ({ ...l, short: l.endX < right * 0.85, edge: edge(l.y), text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
}

const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * 쪽에 그려지는 이미지를 그려지는 자리와 함께 꺼낸다. 연산 목록을 따라가며 변환 행렬(CTM)을 계산해
 * 이미지가 차지하는 면적(단위 정사각형이 옮겨진 넓이)과 위쪽 끝 y를 구한다.
 */
async function pageImages(page, OPS) {
  const ops = await page.getOperatorList();
  const [x0, y0, x1, y1] = page.view;
  const pageArea = Math.abs((x1 - x0) * (y1 - y0));
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const out = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = multiply(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = multiply(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject) {
      const key = args[0];
      const image = await new Promise((resolve) => (key.startsWith('g_') ? page.commonObjs : page.objs).get(key, resolve));
      const area = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / pageArea;
      const top = Math.max(ctm[5], ctm[5] + ctm[3], ctm[5] + ctm[1]);
      if (!image?.data || !image.width || !image.height) {
        out.push({ area, top, pixels: null });
        continue;
      }
      const channels = image.data.length / (image.width * image.height);
      out.push({
        area,
        top,
        pixels: [1, 3, 4].includes(channels) ? { data: image.data, width: image.width, height: image.height, channels } : null,
      });
    }
  }
  return out;
}

/** 여러 쪽의 위·아래 끝(쪽 높이의 10%)에 반복되는 머리말·꼬리말(숫자만 다른 것 포함)을 찾는다. 본문 자리의 반복 문장은 지우지 않는다. */
function repeated(pages) {
  if (pages.length < 3) return new Set();
  const count = new Map();
  for (const lines of pages) {
    const edge = lines.filter((l) => l.edge);
    for (const key of new Set(edge.map((l) => l.text.replace(/\d+/g, '#')))) count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n >= Math.ceil(pages.length * 0.6)).map(([key]) => key));
}

/**
 * 줄 → 마크다운. 본문보다 15% 이상 큰 짧은 줄은 `##` 제목, 줄 간격이 넓으면 문단을 나눈다.
 * 새 블록(제목·문단)이 다음 쪽에서 시작하면 그 앞에 `<!-- page:N -->`를 넣고, 지난 쪽의 이미지를 먼저 내보낸다.
 * 쪽을 넘어 이어지는 문단은 끊지 않는다.
 */
function toMarkdown(pages, title, figures) {
  const drop = repeated(pages);
  const lines = pages
    .flatMap((ls, i) => ls.map((l) => ({ ...l, page: i + 1 })))
    .filter((l) => !(l.edge && (PAGE_NUMBER.test(l.text) || drop.has(l.text.replace(/\d+/g, '#')))));
  // 본문 크기 = 글자 수로 가중한 최빈 크기
  const weight = new Map();
  for (const l of lines) weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const isHeading = (l) => l.size >= body * 1.15 && [...l.text].length <= 80;

  // 제목: PDF 메타데이터가 없으면 첫 쪽에서 가장 큰 제목 줄을 쓰고 본문에서 뺀다.
  let docTitle = title;
  if (!docTitle) {
    const top = lines.filter((l) => l.page === 1 && isHeading(l)).sort((a, b) => b.size - a.size)[0];
    if (top) {
      docTitle = top.text;
      lines.splice(lines.indexOf(top), 1);
    }
  }

  const out = [];
  let para = null;
  let prev = null;
  let markedPage = 0;
  const flush = () => {
    if (para) out.push(para);
    para = null;
  };
  // page 앞까지의 쪽 표시와 이미지를 내보낸다(글자 없는 쪽도 표시를 남긴다).
  const advance = (page) => {
    while (markedPage < page) {
      markedPage++;
      if (markedPage > 1) out.push(...(figures.get(markedPage - 1) ?? []));
      out.push(`<!-- page:${markedPage} -->`);
    }
  };
  for (const line of lines) {
    if (isHeading(line)) {
      flush();
      // 두 줄로 넘어간 제목은 하나로 합친다.
      if (prev && isHeading(prev) && prev.size === line.size && prev.page === line.page && out.at(-1)?.startsWith('## ')) out[out.length - 1] += ` ${line.text}`;
      else {
        advance(line.page);
        out.push(`## ${line.text}`);
      }
    } else {
      const gap = prev && prev.page === line.page ? prev.y - line.y : 0;
      const newPara = !para || isHeading(prev) || gap > line.size * 1.8 || gap < 0;
      const bullet = BULLET.test(line.text);
      if (newPara && !bullet) flush();
      if (!para || (bullet && !para.startsWith('- '))) {
        flush();
        advance(line.page);
      }
      if (bullet) para = para ? `${para}\n- ${line.text.replace(BULLET, '')}` : `- ${line.text.replace(BULLET, '')}`;
      else if (!para) para = line.text;
      else if (prev.short) para += `\n${line.text}`;
      else if (/[A-Za-z]-$/.test(para)) para = para.slice(0, -1) + line.text; // 영어 줄끝 하이픈
      else para += ` ${line.text}`;
    }
    prev = line;
  }
  flush();
  advance(pages.length);
  out.push(...(figures.get(pages.length) ?? []));
  return { title: docTitle, body: out.join('\n\n') };
}

const imageHash = (pixels) => createHash('sha256').update(pixels.data).update(`${pixels.width}x${pixels.height}`).digest('hex');

export const pdfParser = {
  name: 'pdf-unpdf',
  extensions: ['.pdf'],
  async parse(data, file) {
    const pdf = await getDocumentProxy(data);
    if (pdf.numPages > MAX_PAGES) throw new Error(`${pdf.numPages}쪽 — 최대 ${MAX_PAGES}쪽`);
    const { OPS } = await getResolvedPDFJS();

    // 1. 쪽마다 텍스트와 이미지를 읽고 분류한다.
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const lines = await pageLines(page);
      const images = await pageImages(page, OPS);
      const chars = lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
      const coverage = Math.min(1, images.reduce((n, img) => n + img.area, 0));
      const scanned = coverage >= SCAN_IMAGE_RATIO || (chars < SCAN_FEW_CHARS && coverage >= SCAN_FEW_CHARS_RATIO);
      pages.push({ number: i, lines: scanned ? [] : lines, images, scanned });
    }
    const textPages = pages.filter((p) => !p.scanned);
    if (!textPages.some((p) => p.lines.length)) throw new Error('글자가 있는 쪽이 없다 — 스캔본은 OCR(2차)이 필요하다');

    // 2. 텍스트 쪽의 삽입 이미지: 크기 필터 → 로고(여러 쪽 반복) 제외 → 같은 쪽 중복 제외 → 최대 50개.
    const seenOn = new Map();
    for (const page of textPages) {
      for (const img of page.images) {
        if (!img.pixels) continue;
        img.hash = imageHash(img.pixels);
        seenOn.set(img.hash, (seenOn.get(img.hash) ?? new Set()).add(page.number));
      }
    }
    const logo = (hash) => textPages.length >= 2 && seenOn.get(hash).size >= Math.max(2, textPages.length * LOGO_PAGE_RATIO);
    const images = [];
    const figures = new Map();
    let skipped = 0;
    for (const page of textPages) {
      const kept = new Set();
      let n = 0;
      for (const img of [...page.images].sort((a, b) => b.top - a.top)) {
        const ok =
          img.pixels &&
          img.area >= IMAGE_MIN_AREA &&
          img.pixels.width >= IMAGE_MIN_PX &&
          img.pixels.height >= IMAGE_MIN_PX &&
          !logo(img.hash) &&
          !kept.has(img.hash);
        if (!ok || images.length >= IMAGE_MAX) {
          if (img.pixels) skipped++;
          continue;
        }
        kept.add(img.hash);
        const ref = `images/p${page.number}-${++n}`;
        const encoded = await encodePixels(img.pixels);
        images.push({ ref, ...encoded, kind: 'embedded', page: page.number });
        figures.set(page.number, [...(figures.get(page.number) ?? []), `![그림 p${page.number}-${n}](${ref})`]);
      }
    }

    // 3. 스캔 쪽은 글자가 없다는 표시만 남긴다(OCR·쪽 그리기는 4단계에서 결정).
    for (const page of pages.filter((p) => p.scanned)) {
      figures.set(page.number, [`<!-- 스캔 쪽 p${page.number}: 글자가 없어 넣지 않았다 — OCR은 2차 -->`]);
    }

    const info = (await pdf.getMetadata().catch(() => null))?.info ?? {};
    const metaTitle = String(info.Title ?? '').trim();
    const { title, body } = toMarkdown(
      pages.map((p) => p.lines),
      /^(microsoft word|untitled|제목 없음)|\.(docx?|hwp|pages|html?)$/i.test(metaTitle) ? '' : metaTitle,
      figures,
    );
    if (skipped) console.log(`  이미지 ${skipped}개 제외(작음·로고·중복·상한)`);
    return {
      markdown: body,
      images,
      metadata: { title, parser: this.name, pageCount: pdf.numPages, scannedPages: pages.filter((p) => p.scanned).map((p) => p.number) },
    };
  },
};
