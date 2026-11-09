#!/bin/sh
# 운영 배포 — 빌드 후 wrangler deploy. .prod.vars가 있으면 운영 비밀도 함께 올린다.
# 사용: pnpm run deploy (pnpm deploy 아님)
# --secrets-file은 추가 방식이라 파일에 없는 비밀은 지워지지 않는다.
set -e

if [ -f .prod.vars ]; then
  # 빈 값이 운영 비밀을 덮어쓰지 않게 막는다. 아직 없는 값은 줄을 지우거나 주석 처리한다.
  if grep -nE '^[[:space:]]*[A-Z_]+=[[:space:]]*$' .prod.vars; then
    echo '.prod.vars에 빈 값이 있어 배포를 멈춘다 — 위 줄을 채우거나 주석 처리한다.' >&2
    exit 1
  fi
  set -- --secrets-file .prod.vars
fi

# 챗은 운영에서 켜져 있다(docs/guides/chat-rag-setup.md) — .env가 없는 곳에서 배포해도 독이 빠지지 않게 기본값 1.
# 끄려면 PUBLIC_CHAT_ENABLED=0 pnpm run deploy
export PUBLIC_CHAT_ENABLED="${PUBLIC_CHAT_ENABLED:-1}"

astro build
# SEO 회귀 점검(11/09, S-015) — 오류가 있으면 배포하지 않는다. 경고는 보여 주기만 한다
node scripts/seo-check.mjs
wrangler deploy "$@"

# RAG 문서 운영 반영(docs/05-06-chat-rag.md 넣기 7) — 토큰이 있을 때만. 바뀐 게 없으면 D1은 건드리지 않는다.
# 실패해도 배포는 끝난 것이라 경고만 남긴다. 건너뛰려면 RAG_SYNC=0 pnpm run deploy
if [ "${RAG_SYNC:-1}" = 1 ] && { [ -n "$RAG_SYNC_TOKEN" ] || grep -q '^RAG_SYNC_TOKEN=' .prod.vars 2>/dev/null; }; then
  node scripts/rag-sync.mjs || echo '⚠️ RAG 동기화 실패 — pnpm rag:sync:remote로 다시 돌린다' >&2
fi
