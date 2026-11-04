#!/bin/sh
# 클립보드(pbpaste)의 값을 apps/web/.prod-secrets.local 의 NAME 에 넣는다. 값은 화면에 출력하지 않는다.
#   사용: 값을 복사한 뒤  sh apps/web/scripts/set-secret.sh GOOGLE_CLIENT_ID
set -eu
NAME="${1:?사용법: set-secret.sh 이름}"
case "$NAME" in *[!A-Z0-9_]*) echo "이름은 대문자·숫자·_ 만"; exit 1 ;; esac
FILE="$(cd "$(dirname "$0")/.." && pwd)/.prod-secrets.local"
VALUE="$(pbpaste | tr -d '\r\n')"
[ -n "$VALUE" ] || { echo "클립보드가 비어 있어요"; exit 1; }
umask 077
touch "$FILE"
TMP="$(mktemp)"
grep -v "^#\{0,1\} *$NAME=" "$FILE" > "$TMP" || true
printf '%s=%s\n' "$NAME" "$VALUE" >> "$TMP"
mv "$TMP" "$FILE"
chmod 600 "$FILE"
echo "$NAME 저장됨 (${#VALUE}자) → $FILE"
