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
wrangler deploy "$@"
