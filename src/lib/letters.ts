// 레터 제한 — 서버(API)와 클라이언트(시트)가 같이 쓴다.
export const LETTER_LIMITS = {
  subjectMax: 80,
  bodyMin: 10,
  bodyMax: 2000,
  linksMax: 5,
  perDay: 3,
} as const;

export type LetterError = 'invalid' | 'links' | 'limit' | 'duplicate' | 'blocked';

const SCHEME_RE = /\b([a-z][a-z0-9+.-]*):\/\//gi;

/** 링크는 http(s)만, 5개까지. 위반이면 false */
export function linksOk(text: string): boolean {
  const schemes = [...text.matchAll(SCHEME_RE)].map((m) => m[1].toLowerCase());
  return schemes.length <= LETTER_LIMITS.linksMax && schemes.every((s) => s === 'http' || s === 'https');
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
