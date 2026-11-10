// 엣지 캐시(docs/08-blog.md "사이트", S-017) — 블로그는 요청 때 R2에서 그리므로, 같은 주소는 데이터센터마다 잠깐 담아 두고 다시 쓴다.
// Worker가 앞에 있는 응답은 Cloudflare가 저절로 캐시하지 않는다 → Cache API(caches.default). 쿼리는 키에서 뺀다(canonical과 같은 규칙).
// 쿠키를 붙인 응답·200이 아닌 응답은 담지 않는다.

const RULES: { test: RegExp; ttl: number }[] = [
  { test: /^\/(ko|en)\/blog\/(?:[a-z0-9-]+\/)?$/, ttl: 60 }, // 목록·글: 동기화 뒤 늦어도 1분
  { test: /^\/sitemap-blog\.xml$/, ttl: 300 },
  { test: /^\/blog\/img\/[0-9a-f]{32}\.webp$/, ttl: 31536000 }, // 이름이 내용 해시
];

/** 이 요청을 엣지에 담을 시간(초). 담지 않으면 0 */
export function edgeTtl(method: string, pathname: string): number {
  if (method !== 'GET') return 0;
  return RULES.find((r) => r.test.test(pathname))?.ttl ?? 0;
}

export async function withEdgeCache(request: Request, ctx: ExecutionContext, ttl: number, handler: () => Promise<Response>): Promise<Response> {
  const cache = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default;
  if (!cache) return handler();
  const url = new URL(request.url);
  const key = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await handler();
  if (res.status === 200 && !res.headers.has('set-cookie')) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('Cache-Control', `public, max-age=${ttl}`);
    ctx.waitUntil(cache.put(key, copy));
  }
  return res;
}
