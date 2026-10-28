# MVP 운영 공개 가이드 (0–4단계)

작성 2026-10-29. 1–4단계는 로컬에서 구현·검증을 마쳤다. 운영에 띄우려면 아래 계정·키 작업이 필요하다. 배포는 로컬 CLI(`pnpm run deploy`)로만 한다.

## 막혀 있는 것

- **도메인**: Resend로 방문자에게 매직링크를 보내려면 발신 도메인 인증(DKIM·SPF)이 필요하다. 도메인이 없으면 Resend는 계정 본인 메일로만 보낼 수 있어 **방문자 이메일 로그인이 안 된다.** 도메인 전까지 운영 로그인은 Google만 가능
- **Google OAuth 클라이언트**, **Telegram 봇**: 본인 계정에서 발급

## 1. 운영 D1·KV 만들기

```bash
./node_modules/.bin/wrangler d1 create portfolio-web
./node_modules/.bin/wrangler kv namespace create KV
```

출력된 id를 `wrangler.jsonc`의 `d1_databases[0].database_id`, `kv_namespaces[0].id`에 넣고 마이그레이션:

```bash
pnpm db:migrate:remote
```

## 2. 비밀값 (`wrangler secret put <이름>`)

| 이름 | 값 |
| --- | --- |
| `BETTER_AUTH_SECRET` | 무작위 32바이트 — `openssl rand -base64 32` 결과 |
| `BETTER_AUTH_URL` | `https://portfolio-web.yeonghun-yoo.workers.dev` (도메인 연결 후 교체) |
| `ADMIN_EMAILS` | `yeonghun.yoo@gmail.com` |
| `LETTER_TO` | `yeonghun.yoo@gmail.com` |
| `MAIL_FROM` | `letters@{도메인}` — 도메인 인증 후 |
| `RESEND_API_KEY` | [Resend](https://resend.com/) 대시보드에서 발급 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 아래 3 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 아래 4 |

키가 없는 외부 서비스는 운영에서도 죽지 않는다(메일·알림은 로그로, Google 버튼은 "준비 중" 안내). 다만 메일이 안 나가면 로그인·레터 전달이 안 되므로 공개 전에 채운다.

## 3. Google OAuth

[Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 클라이언트 ID(웹) 2개:

- 운영용: 승인된 리디렉션 URI `https://portfolio-web.yeonghun-yoo.workers.dev/auth/callback/google` (도메인 연결 후 그 주소도)
- 로컬용: `http://localhost:8787/auth/callback/google` — 값은 `.dev.vars`에만

## 4. Telegram 봇

1. Telegram에서 [@BotFather](https://t.me/BotFather) → `/newbot` → 토큰
2. 만든 봇에게 아무 메시지나 보낸 뒤 `https://api.telegram.org/bot<토큰>/getUpdates`에서 `chat.id` 확인

## 5. 배포와 확인

```bash
pnpm check && pnpm run deploy
```

- [ ] `/ko`, `/en`, 프로젝트 상세, 개인정보 페이지가 열린다
- [ ] 로그인(Google, 도메인 후 이메일) → 레터 보내기 → 내 메일 도착 + Telegram 알림
- [ ] 관리자로 `/admin` 지표·레터 답장·사용자 차단, 비관리자는 404
- [ ] 실기기 2대(iOS Safari, Android Chrome) 레이아웃
- [ ] 문제 시 `./node_modules/.bin/wrangler rollback`

## 공개 전 사람이 확인할 것

- [ ] 인트로 문구·프로젝트 본문 초안 다듬기 (`src/i18n/*.json`, `src/content/projects/`)
- [ ] 개인정보처리방침 초안 확인 (`src/pages/[locale]/privacy.astro`)
- [ ] 세계관·디자인 확정 시 `src/styles/tokens.css` 교체
