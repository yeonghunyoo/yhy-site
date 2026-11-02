// 파서 레지스트리 — 확장자마다 파서 배열을 두고 앞에서부터 시도한다(WeKnora docreader의 registry + chain_parser).
// 설계: docs/06-ingest.md "1. 파서 계약". 파서는 네트워크·R2를 모르는 순수 변환기다.
//
// interface Parser { name; extensions: string[]; parse(data: Uint8Array, file: string): Promise<ParseResult> }
// interface ParseResult {
//   markdown: string;                       // 이미지는 임시 참조 ![alt](images/p3-1.jpg), 쪽은 <!-- page:N -->
//   images: { ref, data: Uint8Array, mime, kind: 'embedded' | 'scanned_page' | 'local', page? }[];
//   metadata: { title?, parser, pageCount?, scannedPages?: number[] };
// }
// 못 하는 입력이면 throw → 다음 파서. 마지막 파서까지 실패하면 그 오류를 그대로 올린다.
import { extname } from 'node:path';
import { markdownParser } from './parsers/markdown.mjs';
import { pdfParser } from './parsers/pdf.mjs';

const PARSERS = [pdfParser, markdownParser];

export const supportedExtensions = () => [...new Set(PARSERS.flatMap((p) => p.extensions))];

export async function parse(data, file) {
  const ext = extname(file).toLowerCase();
  const chain = PARSERS.filter((p) => p.extensions.includes(ext));
  if (!chain.length) throw new Error(`지원하지 않는 형식 ${ext} — 지원: ${supportedExtensions().join(', ')}`);
  let lastError;
  for (const parser of chain) {
    try {
      return await parser.parse(data, file);
    } catch (error) {
      lastError = error;
      if (chain.length > 1) console.warn(`  ${parser.name} 실패: ${error.message} — 다음 파서`);
    }
  }
  throw lastError;
}
