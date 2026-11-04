// 비정상 요청 방어의 순수 부분 — site docs/guides/cost-guard.md "2. 비정상 요청 방어".
// 경로별 규칙(어느 경로에 무엇을 적용할지)은 앱에 둔다.

/**
 * 고정 창 카운터(isolate 메모리). 허용이면 true. 창이 바뀌면 다시 센다.
 * `violations`는 같은 창에서 상한을 넘은 횟수 — 반복되면 부르는 쪽이 차단 목록에 올린다.
 */
export class WindowLimiter {
  private hits = new Map<string, { window: number; count: number; violations: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(limit: number, windowMs: number, maxKeys = 5_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

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

const BOT_UA =
  /curl|wget|python|httpie|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|scrapy|headlesschrome|phantomjs|selenium|puppeteer|playwright|bot\b|spider|crawl/i;

/** 브라우저라면 반드시 보내는 신호가 빠졌으면 이유, 아니면 null. 로그인 없이 열린 POST에만 쓴다 */
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
