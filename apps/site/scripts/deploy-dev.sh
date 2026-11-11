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
wrangler deploy
