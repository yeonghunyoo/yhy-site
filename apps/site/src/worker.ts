// Worker 진입점(wrangler.jsonc `main`). Astro 처리 앞에서 주소만 정리한다 — 예전 workers.dev 주소는 도메인으로(11/07, S-014),
// 끝 슬래시 없는 언어 페이지는 붙인 주소로 301(11/09, S-015). 규칙은 src/lib/redirects.ts. 블로그 응답은 엣지 캐시(11/10, S-017)
// 정적 파일은 Worker를 거치지 않고 바로 나가므로, 페이지 경로는 `assets.run_worker_first`로 먼저 여기에 들어온다.
import { handle } from '@astrojs/cloudflare/handler';
import { isProdHost, redirectFor } from './lib/redirects';
import { edgeTtl, withEdgeCache } from './lib/edge-cache';

export default {
  async fetch(request, env, ctx) {
    const redirect = redirectFor(request);
    if (redirect) return redirect;
    const url = new URL(request.url);
    // 블로그(요청 때 R2에서 그린다)는 엣지에 잠깐 담는다 — 11/10, docs/08-blog.md
    const ttl = edgeTtl(request.method, url.pathname);
    const res = await (ttl ? withEdgeCache(request, ctx, ttl, () => handle(request, env, ctx)) : handle(request, env, ctx));
    if (isProdHost(url.hostname)) return res;
    // dev Worker·로컬(S-021): 검색엔진이 담지 않게
    const out = new Response(res.body, res);
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return out;
  },
} satisfies ExportedHandler<Env>;
