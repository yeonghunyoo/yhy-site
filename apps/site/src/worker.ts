// Worker 진입점(wrangler.jsonc `main`). Astro 처리 앞에서 주소만 정리한다 — 예전 workers.dev 주소는 도메인으로(11/07, S-014),
// 끝 슬래시 없는 언어 페이지는 붙인 주소로 301(11/09, S-015). 규칙은 src/lib/redirects.ts. 블로그 응답은 엣지 캐시(11/10, S-017)
// 정적 파일은 Worker를 거치지 않고 바로 나가므로, 페이지 경로는 `assets.run_worker_first`로 먼저 여기에 들어온다.
import { handle } from '@astrojs/cloudflare/handler';
import { redirectFor } from './lib/redirects';
import { edgeTtl, withEdgeCache } from './lib/edge-cache';

export default {
  fetch(request, env, ctx) {
    const redirect = redirectFor(request);
    if (redirect) return redirect;
    // 블로그(요청 때 R2에서 그린다)는 엣지에 잠깐 담는다 — 11/10, docs/08-blog.md
    const ttl = edgeTtl(request.method, new URL(request.url).pathname);
    if (ttl) return withEdgeCache(request, ctx, ttl, () => handle(request, env, ctx));
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
