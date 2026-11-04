// 사용량 계산 — 런타임(env) 없이 동작하는 순수 함수(docs/guides/cost-guard.md). 로컬 테스트가 그대로 불러 쓴다.

/** 무료 한도(2026-11 기준). day = UTC 하루, month = 한 달 */
export const FREE_LIMITS = {
  workersRequestsDay: 100_000,
  aiNeuronsDay: 10_000,
  d1RowsReadDay: 5_000_000,
  d1RowsWrittenDay: 100_000,
  kvReadsDay: 100_000,
  kvWritesDay: 1_000,
  r2ClassAMonth: 1_000_000,
  r2ClassBMonth: 10_000_000,
  r2StorageBytes: 10 * 1024 ** 3,
  vectorizeQueriedDimsMonth: 30_000_000,
  vectorizeStoredDims: 5_000_000,
  resendDay: 100,
  resendMonth: 3_000,
} as const;

/** 우리 차단기 기본값(환경변수로 바꿀 수 있다) */
export const DEFAULT_CAPS = {
  aiNeuronsDay: 8_000,
  chatTurnsDay: 500,
  mailDay: 80,
  mailMonth: 2_800,
  lettersDay: 50,
} as const;

// R2 작업 등급(Cloudflare R2 가격표의 Class A/B). 목록에 없는 작업(삭제 등)은 무료로 본다.
const R2_CLASS_A = new Set([
  'ListBuckets', 'PutBucket', 'ListObjects', 'ListObjectsV2', 'PutObject', 'CopyObject', 'CompleteMultipartUpload',
  'CreateMultipartUpload', 'UploadPart', 'UploadPartCopy', 'ListMultipartUploads', 'ListParts', 'PutBucketEncryption',
  'PutBucketCors', 'PutBucketLifecycleConfiguration', 'LifecycleStorageTierTransition',
]);
const R2_CLASS_B = new Set([
  'HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);

export function r2Class(actionType: string): 'A' | 'B' | 'free' {
  if (R2_CLASS_A.has(actionType)) return 'A';
  if (R2_CLASS_B.has(actionType)) return 'B';
  return 'free';
}

// 챗 1턴의 뉴런 추정(docs/05-06-chat-rag.md 단가): 로그의 토큰은 슈퍼바이저 + 답변(Gemma 4).
// 로그에 안 잡히는 유해 검사(Llama Guard, 약 9.3)와 임베딩(약 0.03)은 턴마다 고정값으로 더한다.
const GEMMA_IN_PER_TOKEN = 9_091 / 1_000_000;
const GEMMA_OUT_PER_TOKEN = 27_273 / 1_000_000;
export const NEURONS_FIXED_PER_TURN = 10;

export function estimateNeurons(turns: number, tokensIn: number, tokensOut: number): number {
  return turns * NEURONS_FIXED_PER_TURN + tokensIn * GEMMA_IN_PER_TOKEN + tokensOut * GEMMA_OUT_PER_TOKEN;
}

export type Level = 'ok' | 'warn' | 'over';

/** 사용률(0~∞)과 단계: 80% 이상 warn, 100% 이상 over */
export function usageLevel(used: number, limit: number): { ratio: number; level: Level } {
  const ratio = limit > 0 ? used / limit : 0;
  return { ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
}

/** 환경변수 상한: 양의 정수면 그 값, 아니면 기본값 */
export function capFrom(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * 고정 창 카운터(isolate 메모리). 허용이면 true. 창이 바뀌면 다시 센다.
 * `violations`는 같은 창에서 상한을 넘은 횟수 — 반복되면 부르는 쪽이 차단 목록에 올린다.
 */
export class WindowLimiter {
  private hits = new Map<string, { window: number; count: number; violations: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5_000,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; violations: number } {
    const window = Math.floor(now / this.windowMs);
    let entry = this.hits.get(key);
    if (!entry || entry.window !== window) {
      if (this.hits.size >= this.maxKeys) this.hits.clear(); // 메모리 상한 — 한 번에 비운다
      entry = { window, count: 0, violations: 0 };
      this.hits.set(key, entry);
    }
    entry.count++;
    if (entry.count <= this.limit) return { allowed: true, violations: entry.violations };
    entry.violations++;
    return { allowed: false, violations: entry.violations };
  }
}

/** 경로별 허용 메서드. 목록에 없는 /api 경로는 GET·POST */
export function allowedMethods(pathname: string): string[] {
  if (pathname.startsWith('/auth/')) return ['GET', 'POST'];
  if (pathname.startsWith('/media/')) return ['GET', 'HEAD'];
  if (pathname === '/api/chat') return ['POST'];
  if (pathname === '/api/letters') return ['POST'];
  if (pathname.startsWith('/api/admin/')) return ['GET', 'POST'];
  return ['GET', 'POST'];
}

/** 상태를 바꾸는 요청의 출처가 사이트와 같은지(Origin, 없으면 Referer) */
export function sameOrigin(siteOrigin: string, origin: string | null, referer: string | null): boolean {
  if (origin) return origin === siteOrigin;
  if (referer) {
    try {
      return new URL(referer).origin === siteOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

// 봇 신호(docs/guides/cost-guard.md "2. 비정상 요청 방어" 7) — 로그인 없이 열린 POST /api/letters·/api/chat에만 쓴다.
const BOT_UA =
  /curl|wget|python|httpie|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|scrapy|headlesschrome|phantomjs|selenium|puppeteer|playwright|bot\b|spider|crawl/i;

export const botChecked = (method: string, pathname: string) => method === 'POST' && (pathname === '/api/letters' || pathname === '/api/chat');

/** 브라우저라면 반드시 보내는 신호가 빠졌으면 이유, 아니면 null */
export function botReason(headers: Headers): string | null {
  const ua = headers.get('user-agent') ?? '';
  if (!ua) return 'no_ua';
  if (BOT_UA.test(ua)) return 'tool_ua';
  if (headers.get('sec-fetch-site') !== 'same-origin') return 'fetch_site';
  const mode = headers.get('sec-fetch-mode');
  if (mode !== 'cors' && mode !== 'same-origin') return 'fetch_mode';
  if (!headers.get('accept-language')) return 'no_lang';
  return null;
}
