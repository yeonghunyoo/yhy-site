// 사용량 계산 — 런타임(env) 없이 동작하는 순수 함수(docs/guides/cost-guard.md). 로컬 테스트가 그대로 불러 쓴다.
// 두 앱 공용인 것(usageLevel·capFrom·WindowLimiter·sameOrigin·botReason)은 @yhy/cf-kit에 있다. 여기는 사이트 전용 규칙.

export { capFrom, usageLevel, type Level } from '@yhy/cf-kit/budget';

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

/** 경로별 허용 메서드. 목록에 없는 /api 경로는 GET·POST */
export function allowedMethods(pathname: string): string[] {
  if (pathname.startsWith('/auth/')) return ['GET', 'POST'];
  if (pathname.startsWith('/media/')) return ['GET', 'HEAD'];
  if (pathname === '/api/chat') return ['POST'];
  if (pathname === '/api/letters') return ['POST'];
  if (pathname.startsWith('/api/admin/')) return ['GET', 'POST'];
  return ['GET', 'POST'];
}

export const botChecked = (method: string, pathname: string) => method === 'POST' && (pathname === '/api/letters' || pathname === '/api/chat');
