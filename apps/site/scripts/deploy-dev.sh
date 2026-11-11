#!/bin/sh
# 개발 환경 배포(11/11, decisions S-021) — 운영에 넣기 전 확인용 Worker portfolio-web-dev.
# 사용: pnpm deploy:dev  → https://portfolio-web-dev.yeonghun-yoo.workers.dev
# dev 전용 D1·KV(wrangler.jsonc env.dev), R2·Vectorize·AI는 운영과 같이 읽는다. 비밀값은 올리지 않는다.
set -e
export PUBLIC_CHAT_ENABLED="${PUBLIC_CHAT_ENABLED:-1}"
CLOUDFLARE_ENV=dev astro build
node scripts/seo-check.mjs || echo '⚠️ SEO 점검 오류 — dev라 배포는 계속한다(운영 배포 전에 고친다)' >&2
# 처음 한 번·스키마가 바뀌면: dev D1에 마이그레이션
wrangler d1 migrations apply portfolio-web-dev --remote -c wrangler.jsonc --env dev
# 11/11: dev D1 바인딩이 Cloudflare 오류 10021("binding DB of type d1 failed to generate")로 실패한다 — 고쳐질 때까지
# D1 없이라도 올린다(화면·블로그 확인용. 레터·챗·어드민은 dev에서 동작하지 않음). docs/00-infra.md "개발 환경"
if ! wrangler deploy; then
  echo '⚠️ D1 바인딩 실패 — D1 없이 배포한다(레터·챗·어드민은 dev에서 안 됨)' >&2
  node -e "const f='dist/server/wrangler.json',c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.d1_databases=[];require('fs').writeFileSync('dist/server/wrangler.nod1.json',JSON.stringify(c))"
  wrangler deploy -c dist/server/wrangler.nod1.json
fi
