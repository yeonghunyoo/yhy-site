# 도메인 연동 가이드 — bettercurl.dev (11/04)

11/04 `bettercurl.dev` 구매(Cloudflare Registrar, 사이트 계정). 같은 계정에 DNS 영역이 자동으로 생겼다(네임서버 `gordon`·`stephane.ns.cloudflare.com`, 상태 active). 이 문서는 도메인을 사이트·메일·로그인에 잇는 순서다. 결정 배경은 [overview.md](../overview.md) "확정된 결정 사항".

## 주소 체계

| 쓰임 | 주소 | 어떻게 |
| --- | --- | --- |
| 사이트 | `https://bettercurl.dev` | Worker 커스텀 도메인(`wrangler.jsonc` `routes`). workers.dev 주소도 당분간 남는다 |
| 사이트·챗에 보이는 연락처 | `hello@bettercurl.dev` | Cloudflare Email Routing → 개인 메일로 전달. 개인 Gmail은 사이트·RAG 문서에 쓰지 않는다 |
| 레터 수신(`LETTER_TO`) | `letters@bettercurl.dev` | Email Routing → 개인 메일로 전달 |
| 메일 발신(`MAIL_FROM`) | `letters@mail.bettercurl.dev` | Resend, 보내기 전용 하위 도메인 `mail.`([resend-setup.md](resend-setup.md) 1) |
| 관리자 로그인(`ADMIN_EMAILS`) | 개인 메일 그대로 | 로그인 계정이라 바꾸지 않는다 |

- 받는 주소(Email Routing)는 루트 도메인 MX, 보내는 주소(Resend)는 `send.mail.` 하위 도메인 MX라 겹치지 않는다
- Email Routing은 전달만 한다(보내기 불가). 답장은 개인 메일함에서 하거나 어드민 답장(Resend)으로 한다

## 순서

| # | 할 일 | 누가 | 상태 |
| --- | --- | --- | --- |
| 1 | 도메인 구매, DNS 영역 | 사용자 | 완료(11/04) |
| 2 | 코드: `wrangler.jsonc` 커스텀 도메인·`BETTER_AUTH_URL`, `astro.config.mjs` `site`, RAG 문서 연락처 → `hello@` | Claude | 완료(11/04) |
| 3 | Email Routing 켜기 → 대상 주소(개인 메일) 추가·인증 메일 클릭 → 규칙 `hello@`·`letters@` → 개인 메일 | 사용자(대시보드) 또는 Claude(토큰 권한 추가 후) | |
| 4 | Resend: Domains → Add `mail.bettercurl.dev`(도쿄) → **Sign in to Cloudflare**로 DNS 자동 등록 → Verified → Open·Click Tracking 끄기 → Sending 키 | 사용자(Resend 대시보드) | |
| 5 | Google OAuth: 승인된 리디렉션 URI에 `https://bettercurl.dev/auth/callback/google`, 승인된 JavaScript 원본에 `https://bettercurl.dev` 추가 | 사용자(Google Cloud 콘솔) | |
| 6 | 운영 비밀: `MAIL_FROM=letters@mail.bettercurl.dev`, `LETTER_TO=letters@bettercurl.dev`, (새 키면) `RESEND_API_KEY` — `.prod.vars`에 넣고 배포 또는 `wrangler secret put` | 사용자 | |
| 7 | 배포 `pnpm site deploy` → `https://bettercurl.dev` 열림, 인증서 자동 | 사용자(클라우드 세션은 배포가 권한 검사에 막힌다) | |
| 8 | RAG 운영 반영(`rag:build:remote` + `rag:reindex:api`) — 연락처 바뀐 이력서 | Claude | 완료(11/04) |
| 9 | 확인: 아래 "확인" | 함께 | |

## Email Routing (3) — 대시보드

1. 대시보드 → `bettercurl.dev` → **Email** → **Email Routing** → **Get started / Enable**. MX·SPF(TXT) 레코드를 추가하겠냐고 물으면 **추가**
2. **Destination addresses** → 개인 메일 추가 → 그 메일함의 Cloudflare 인증 메일에서 **Verify** 클릭(이것만은 대신할 수 없다)
3. **Routing rules → Custom addresses** → `hello` → Send to 개인 메일, `letters` → 같은 개인 메일. Catch-all은 끈다(스팸)
4. 확인: 다른 메일 계정에서 `hello@bettercurl.dev`로 보내 개인 메일함에 도착하는지

Claude가 하려면 토큰에 **Zone → DNS Edit, Zone → Email Routing Rules Edit, Account → Email Routing Addresses Edit**(영역은 `bettercurl.dev`만)을 더한다. 대상 주소 인증 클릭은 그래도 사용자가 한다.

## 확인

- `https://bettercurl.dev/ko/` 200, `http://` → `https://`(`.dev`는 HTTPS만)
- 레터 보내기 → `letters@bettercurl.dev` → 개인 메일함 도착, 발신 `yhy <letters@mail.bettercurl.dev>`, 회신 주소는 방문자
- 어드민 답장 → 방문자 주소로 도착(Resend 로그 Delivered)
- 관리자 Google 로그인·이메일 로그인 정상
- 챗 "연락처 알려줘" → `hello@bettercurl.dev`(개인 Gmail이 나오지 않는다)
