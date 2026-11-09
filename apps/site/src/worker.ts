// Worker 진입점(wrangler.jsonc `main`). Astro 처리 앞에서 주소만 정리한다 — 예전 workers.dev 주소는 도메인으로(11/07, S-014),
// 끝 슬래시 없는 언어 페이지는 붙인 주소로 301(11/09, S-015). 규칙은 src/lib/redirects.ts
// 정적 파일은 Worker를 거치지 않고 바로 나가므로, 페이지 경로는 `assets.run_worker_first`로 먼저 여기에 들어온다.
import { handle } from '@astrojs/cloudflare/handler';
import { redirectFor } from './lib/redirects';

export default {
  fetch(request, env, ctx) {
    return redirectFor(request) ?? handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
