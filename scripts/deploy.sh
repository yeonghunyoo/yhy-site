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

astro build
wrangler deploy "$@"
