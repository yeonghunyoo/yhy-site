// Worker 앞단 리디렉션(src/worker.ts). 정적 페이지도 assets.run_worker_first로 먼저 여기를 거친다.
// 순수 함수라 Worker 없이 확인한다: node scripts/redirects-check.mjs

export const SITE_ORIGIN = 'https://bettercurl.dev';

/** 운영 Worker의 예전 workers.dev 주소만 도메인으로 보낸다. dev Worker(portfolio-web-dev.…workers.dev, S-021)는 그대로 둔다 */
export const isProdWorkersDev = (host: string) => /^portfolio-web\.[^.]+\.workers\.dev$/.test(host);

/** 검색에 내보낼 주소인지 — 운영 도메인만. 나머지(dev Worker·로컬)는 X-Robots-Tag noindex */
export const isProdHost = (host: string) => host === new URL(SITE_ORIGIN).hostname;

/** 언어 페이지인데 끝 슬래시가 없으면(/ko, /en/privacy, /ko/projects/nuvo) 붙인 경로. 파일(.txt 등)·그 밖 경로는 그대로 */
export function withTrailingSlash(pathname: string): string {
  return /^\/(ko|en)(\/[^.]*)?$/.test(pathname) && !pathname.endsWith('/') ? `${pathname}/` : pathname;
}

/**
 * 보낼 곳이 있으면 응답, 없으면 null.
 * - 예전 workers.dev 주소 → bettercurl.dev(11/07, S-014). 끝 슬래시도 같이 붙여 한 번에 보낸다
 * - 끝 슬래시 없는 언어 페이지 → 붙인 주소로 301(11/09, S-015). 정적 자산 처리(html_handling)는 307(임시)을 써서 검색엔진에 영구 이동으로 알리려고 앞에서 돌린다
 * GET·HEAD는 301, 나머지는 메서드를 지키는 308
 */
export function redirectFor(request: Request): Response | null {
  const url = new URL(request.url);
  const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
  const path = withTrailingSlash(url.pathname);
  if (isProdWorkersDev(url.hostname)) return Response.redirect(`${SITE_ORIGIN}${path}${url.search}`, status);
  if (path !== url.pathname) return Response.redirect(`${url.origin}${path}${url.search}`, status);
  return null;
}
