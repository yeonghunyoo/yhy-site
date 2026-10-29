# MVP 운영 공개 가이드 (0–4단계)

작성 2026-10-29. 1–4단계는 로컬에서 구현·검증을 마쳤다. 운영에 띄우려면 아래 계정·키 작업이 필요하다. 배포는 로컬 CLI(`pnpm run deploy`)로만 한다.

## 막혀 있는 것

- **도메인**: Resend로 방문자에게 매직링크를 보내려면 발신 도메인 인증(DKIM·SPF)이 필요하다. 도메인이 없으면 Resend는 계정 본인 메일로만 보낼 수 있어 **방문자 이메일 로그인이 안 된다.** 도메인 전까지 운영 로그인은 Google만 가능
- **Google OAuth 클라이언트**, **Telegram 봇**: 본인 계정에서 발급

## 1. 운영 D1·KV 만들기 — 완료 (10/29)

D1 `portfolio-web`(APAC)과 KV를 만들어 id를 `wrangler.jsonc`에 넣었고, 운영 DB에 마이그레이션(0000, 0001)을 적용했다. 새 마이그레이션이 생기면 배포 전에 `pnpm db:migrate:remote`.

## 2. 비밀값 (`.prod.vars`)

`BETTER_AUTH_URL`·`SITE_NAME`은 비밀이 아니라 `wrangler.jsonc`의 `vars`에 있다. 운영 비밀은 `.prod.vars`(gitignore)에 적고 `pnpm run deploy`로 함께 올린다. 파일에 없는 비밀은 그대로 남으니 새로 넣거나 바꿀 것만 적으면 된다.

```bash
cp .prod.vars.example .prod.vars   # 채울 줄만 주석을 풀고 값을 넣는다
pnpm run deploy
./node_modules/.bin/wrangler secret list
```

`BETTER_AUTH_SECRET`·`ADMIN_EMAILS`·`LETTER_TO`는 10/29 `wrangler secret put`으로 넣어 두었다.

| 이름 | 값 | 시점 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | 무작위 32바이트(위 명령이 생성) | **배포 전 필수** — 없으면 로그인·레터·어드민이 500 |
| `ADMIN_EMAILS` | `yeonghun.yoo@gmail.com` | 배포 전 |
| `LETTER_TO` | `yeonghun.yoo@gmail.com` | 배포 전 |
| `MAIL_FROM` | `letters@{도메인}` | 도메인 인증 후 |
| `RESEND_API_KEY` | [Resend](https://resend.com/) 대시보드에서 발급 | 도메인 인증 후 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 아래 3 | 발급 후 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 아래 4 | 발급 후 |

메일 키가 없으면 운영에서도 매직링크가 로그로만 나간다. 관리자 본인은 `./node_modules/.bin/wrangler tail`을 켜 두고 로그인 링크를 받아 `/admin`을 확인할 수 있다.

키가 없는 외부 서비스는 운영에서도 죽지 않는다(메일·알림은 로그로, Google 버튼은 "준비 중" 안내). 다만 메일이 안 나가면 로그인·레터 전달이 안 되므로 공개 전에 채운다.

## 3. Google OAuth

GCP 프로젝트 `portfolio-web-yhy`(10/29 `gcloud projects create`로 생성). OAuth 동의 화면과 클라이언트는 CLI·API가 없어 [Google Auth Platform](https://console.cloud.google.com/auth/clients?project=portfolio-web-yhy)에서 만든다. OAuth 클라이언트 ID(웹) 1개를 로컬·운영이 같이 쓴다. 같은 값을 `.dev.vars`와 `.prod.vars`에 둔다. 승인된 리디렉션 URI:

- `http://localhost:8787/auth/callback/google`
- `https://portfolio-web.yeonghun-yoo.workers.dev/auth/callback/google` (도메인 연결 후 그 주소도 추가)
- 대상(Audience)을 프로덕션으로 게시해야 테스트 사용자 외에도 로그인된다

## 4. Telegram 봇

1. Telegram에서 [@BotFather](https://t.me/BotFather) → `/newbot` → 토큰
2. 만든 봇에게 아무 메시지나 보낸 뒤 `https://api.telegram.org/bot<토큰>/getUpdates`에서 `chat.id` 확인

## 5. 배포와 확인

```bash
pnpm check && pnpm run deploy
```

- [x] `/ko`, `/en`, 프로젝트 상세, 개인정보 페이지가 열린다 (10/29)
- [ ] 로그인(Google, 도메인 후 이메일) → 레터 보내기 → 내 메일 도착 + Telegram 알림
  - [x] Google 로그인 → 레터 저장 (10/29, workers.dev). 메일·Telegram은 키가 없어 로그로만 — 이때 레터는 `status = sent`로 남아 재전송 대상이 아니다
- [ ] 관리자로 `/admin` 지표·레터 답장·사용자 차단, 비관리자는 404
  - [x] 관리자 `/admin` 접속 (10/29)
- [ ] 실기기 2대(iOS Safari, Android Chrome) 레이아웃
- [ ] 문제 시 `./node_modules/.bin/wrangler rollback`

## 공개 전 사람이 확인할 것

- [ ] 인트로 문구·프로젝트 본문 초안 다듬기 (`src/i18n/*.json`, `src/content/projects/`)
- [ ] 개인정보처리방침 초안 확인 (`src/pages/[locale]/privacy.astro`)
- [ ] 세계관·디자인 확정 시 `src/styles/tokens.css` 교체
