// Worker 진입점(wrangler.jsonc `main`). Astro 처리 앞에서 예전 workers.dev 주소만 도메인으로 보낸다(11/07, docs/guides/domain-setup.md "workers.dev 주소").
// 정적 파일은 Worker를 거치지 않고 바로 나가므로, 페이지 경로는 `assets.run_worker_first`로 먼저 여기에 들어온다.
import { handle } from '@astrojs/cloudflare/handler';

const SITE_ORIGIN = 'https://bettercurl.dev';

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.endsWith('.workers.dev')) {
      // 경로·쿼리는 그대로. GET·HEAD는 301, 나머지는 메서드를 지키는 308
      const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
      return Response.redirect(`${SITE_ORIGIN}${url.pathname}${url.search}`, status);
    }
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
