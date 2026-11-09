# 도메인 연동 가이드 — bettercurl.dev (11/04)

11/04 `bettercurl.dev` 구매(Cloudflare Registrar, 사이트 계정). 같은 계정에 DNS 영역이 자동으로 생겼다(네임서버 `gordon`·`stephane.ns.cloudflare.com`, 상태 active). 이 문서는 도메인을 사이트·메일·로그인에 잇는 순서다. 결정 배경은 [overview.md](../overview.md) "확정된 결정 사항".

## 주소 체계

| 쓰임 | 주소 | 어떻게 |
| --- | --- | --- |
| 사이트 | `https://bettercurl.dev` | Worker 커스텀 도메인(`wrangler.jsonc` `routes`). 예전 workers.dev 주소는 여기로 301(아래 "workers.dev 주소") |
| 사이트·챗에 보이는 연락처 | `hello@bettercurl.dev` | Cloudflare Email Routing → 개인 메일로 전달. 개인 Gmail은 사이트·RAG 문서에 쓰지 않는다 |
| 레터 수신(`LETTER_TO`) | `letters@bettercurl.dev` | Email Routing → 개인 메일로 전달 |
| 메일 발신(`MAIL_FROM`) | `letters@mail.bettercurl.dev` | Resend 보내기 전용 하위 도메인 `mail.`(11/04 다시 정함). DKIM `resend._domainkey.mail`, 반송 `send.mail`. 루트 `bettercurl.dev`도 Resend에 먼저 인증돼 있다 — `mail.`이 인증되면 Resend에서 루트를 지울지 정한다 |
| 관리자 로그인(`ADMIN_EMAILS`) | 개인 메일 그대로 | 로그인 계정이라 바꾸지 않는다 |

- 받는 주소(Email Routing)는 루트 도메인 MX, Resend의 반송용 레코드는 `send.` 하위 도메인이라 겹치지 않는다. 보내는 주소와 받는 주소가 같은 `letters@bettercurl.dev`여도 된다
- Email Routing은 전달만 한다(보내기 불가). 답장은 개인 메일함에서 하거나 어드민 답장(Resend)으로 한다

## 순서

| # | 할 일 | 누가 | 상태 |
| --- | --- | --- | --- |
| 1 | 도메인 구매, DNS 영역 | 사용자 | 완료(11/04) |
| 2 | 코드: `wrangler.jsonc` 커스텀 도메인·`BETTER_AUTH_URL`, `astro.config.mjs` `site`, RAG 문서 연락처 → `hello@` | Claude | 완료(11/04) |
| 3 | Email Routing 켜기 → 대상 주소(개인 메일) 추가·인증 메일 클릭 → 규칙 `hello@`·`letters@` → 개인 메일 | 사용자(대시보드) 또는 Claude(토큰 권한 추가 후) | 완료(11/04): 사용자가 켜기·인증, Claude가 API로 대상 주소·규칙. `letters@` 전달 도착 확인(몇 분 늦게). 아래 "겪은 일" |
| 4 | Resend: Domains → Add `mail.bettercurl.dev`(도쿄). 11/04 루트 `bettercurl.dev`가 먼저 등록·Verified됨 → **Sign in to Cloudflare**로 DNS 자동 등록 → Verified → Open·Click Tracking 끄기 → Sending 키 | 사용자(Resend 대시보드) | 일부(11/04): Verified 확인(시험 발송·도착 확인). Tracking 끄기는 미확인 — 아래 "Resend 점검" |
| 5 | Google OAuth: 승인된 리디렉션 URI에 `https://bettercurl.dev/auth/callback/google`, 승인된 JavaScript 원본에 `https://bettercurl.dev` 추가 | 사용자(Google Cloud 콘솔) | 완료(11/04, 배포 후 `bettercurl.dev`에서 Google 로그인 확인) |
| 6 | `RESEND_API_KEY`는 운영 Secret(대시보드). `MAIL_FROM`·`LETTER_TO`는 공개 주소라 비밀이 아니다 → `wrangler.jsonc` `vars`에 둔다(배포해도 유지, 클라우드·로컬 같은 값). 대시보드에서 Text 변수로 넣으면 다음 배포 때 `vars`로 덮어써진다 | 사용자(키), Claude(vars) | 완료(11/04, Resend Verified) |
| 7 | 배포 `pnpm site deploy` → `https://bettercurl.dev` 열림, 인증서 자동 | 사용자(클라우드 세션은 배포가 권한 검사에 막힌다) | 완료(11/04, Claude가 클라우드 세션에서 배포, 버전 `09489d76`). 커스텀 도메인 붙음·A/AAAA 응답. `workers_dev`가 `wrangler.jsonc`에 없어 workers.dev 주소는 꺼졌다→ 11/07 다시 켜고 도메인으로 301(아래 "workers.dev 주소", S-014). RAG 동기화는 토큰이 없어 건너뜀 → 8 |
| 8 | RAG 운영 반영(`pnpm rag:build:remote` → `pnpm rag:reindex:api`) — 연락처 바뀐 이력서. 안 하면 챗이 옛 연락처(개인 Gmail)를 답한다 | 사용자(클라우드 세션에서 11/04 권한 검사에 막힘) 또는 허용 후 Claude | |
| 9 | 확인: 아래 "확인" | 함께 | |

## Resend 점검 (4) — 11/04

- 세션의 `RESEND_API_KEY`는 **Sending access** 키라 `GET /domains`·`PATCH /domains/{id}`가 401(`restricted_api_key`)이다. 도메인 상태·Tracking 설정은 API로 못 읽고 못 바꾼다
- 시험 발송 `letters@mail.bettercurl.dev` → 개인 메일: API가 받음(id `01a1a72e-43c6-7eac-89ab-714349871638`). Resend는 인증 안 된 도메인 발신을 403으로 거절하므로 `mail.bettercurl.dev`는 **Verified**로 본다. 11/04 개인 메일함 도착을 사용자가 확인함
- 남은 일(사용자, Resend 대시보드):
  1. Domains → `mail.bettercurl.dev` → **Configuration** → Open Tracking·Click Tracking 끄기(켜져 있으면 링크가 추적 주소로 바뀌고 스팸 점수가 오른다)
  2. 루트 `bettercurl.dev`를 Resend에서 지울지 정한다(지우면 DNS의 `resend._domainkey`·`send.` 레코드도 정리)
- Claude가 API로 하려면 **Full access** 키를 세션에만 잠깐 주고 끝나면 지운다. 운영 Secret은 Sending 키 그대로 둔다

## Email Routing (3) — 대시보드

1. 대시보드 → `bettercurl.dev` → **Email** → **Email Routing** → **Get started / Enable**. MX·SPF(TXT) 레코드를 추가하겠냐고 물으면 **추가**
2. **Destination addresses** → 개인 메일 추가 → 그 메일함의 Cloudflare 인증 메일에서 **Verify** 클릭(이것만은 대신할 수 없다)
3. **Routing rules → Custom addresses** → `hello` → Send to 개인 메일, `letters` → 같은 개인 메일. Catch-all은 끈다(스팸)
4. 확인: 다른 메일 계정에서 `hello@bettercurl.dev`로 보내 개인 메일함에 도착하는지

11/04 실제로 한 것: 사이트 토큰으로 대상 주소 추가(인증 메일 발송)·규칙 생성은 됐고, 켜기(`POST /zones/{id}/email/routing/dns`)와 설정 조회(`GET /zones/{id}/email/routing`)는 `Authentication error`라 사용자가 대시보드에서 켰다. 대상 주소가 unverified면 규칙 생성이 `2054 Destination address is not verified`로 거절되고, Verify 클릭 뒤 API에 verified로 보이기까지 1~2분 걸렸다. 현재 규칙: `hello@`·`letters@` → 개인 메일, catch-all 꺼짐(drop). MX `route1~3.mx.cloudflare.net`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`

겪은 일(11/04):
- MX·규칙이 생기기 전에 `@bettercurl.dev`로 보낸 메일은 Cloudflare가 `Recipient not found`로 거절했고, Resend가 그 주소(`hello@`·`letters@`)를 **Suppressions**에 자동으로 넣었다. 그 뒤로는 규칙이 있어도 Resend가 보내지 않는다(로그 "Recipient was suppressed"). Resend 대시보드 Suppressions에서 지워서 풀었다. 처음 연동할 때는 Email Routing을 켜고 규칙까지 만든 **뒤에** 시험 메일을 보낸다
- 풀린 뒤 첫 메일은 Resend 로그가 한동안 `Sent`(Delivered 아님)로 남다가 몇 분 뒤 도착했다(재시도로 보임)
- `_dmarc.bettercurl.dev`가 없어 Resend가 "No DMARC record found"를 띄운다. 전달 경로에서 Gmail이 인증을 엄하게 보므로 `TXT _dmarc` `v=DMARC1; p=none;`을 둔다(감시만, `mail.`에도 적용). 11/04 사용자 요청으로 Claude가 API로 추가함(처음 시도는 권한 검사에 막혔고, 사용자가 명시적으로 맡긴 뒤 됨). 재점검(11/04): 1.1.1.1·8.8.8.8 모두 조회됨. `_dmarc.mail`은 따로 두지 않는다 — 하위 도메인은 루트 정책을 따른다. 정렬: DKIM `d=mail.bettercurl.dev`, SPF 반송 주소 `send.mail.bettercurl.dev` 둘 다 루트 `bettercurl.dev` 아래라 완화 정렬로 통과

Claude가 하려면 토큰에 **Zone → DNS Edit, Zone → Email Routing Rules Edit, Account → Email Routing Addresses Edit**(영역은 `bettercurl.dev`만)을 더한다. 대상 주소 인증 클릭은 그래도 사용자가 한다.

## workers.dev 주소 — 11/07

예전 링크 `https://portfolio-web.yeonghun-yoo.workers.dev/…`는 경로·쿼리를 그대로 붙여 `https://bettercurl.dev/…`로 보낸다(결정 S-014).

- `wrangler.jsonc`: `workers_dev: true`(routes가 있으면 기본값이 false), `preview_urls: false`(버전별 미리보기 주소는 안 씀), `main: ./src/worker.ts`
- `src/worker.ts`: 호스트가 `*.workers.dev`면 GET·HEAD는 301, 그 밖은 308(메서드 유지)로 보낸다. 아니면 Astro 처리(`@astrojs/cloudflare/handler`)로 넘긴다
- 11/09(S-015): 규칙을 `src/lib/redirects.ts`로 빼고, 끝 슬래시 없는 언어 페이지(`/ko`, `/en/privacy`)도 301로 붙인 주소에 보낸다(정적 자산 처리는 307). workers.dev 요청은 슬래시까지 붙여 한 번에. 확인 `pnpm site test`(`scripts/redirects-check.mjs`), 로컬 `npx wrangler dev -c dist/server/wrangler.json` → `/ko` 301 `/ko/`(11/09 확인)
- 정적 파일은 원래 Worker를 거치지 않아 리디렉션할 수 없다. `assets.run_worker_first`로 페이지 경로를 Worker에 먼저 보내고, 해시 붙은 빌드 파일·이미지(`/_astro/*`, `/hero/*`, `/favicon.svg`, `/apple-touch-icon.png` — 11/09 OG 이미지는 `/_astro/`로 옮김)는 빼서 바로 나가게 둔다. 그래서 `bettercurl.dev` 페이지 요청도 Worker 호출로 센다(무료 하루 10만 회 안). 새 정적 폴더를 `public/`에 두면 이 목록에 넣을지 본다
- 로컬 확인: `pnpm build` 뒤 `npx wrangler dev -c dist/server/wrangler.json --local-upstream portfolio-web.yeonghun-yoo.workers.dev` → `/ko/`가 301 `https://bettercurl.dev/ko/`. `--local-upstream bettercurl.dev`면 그대로 200(11/07 확인)
- 운영 확인(배포 뒤): `curl -sI https://portfolio-web.yeonghun-yoo.workers.dev/ko/` → `301`, `location: https://bettercurl.dev/ko/`

## 확인

- `https://bettercurl.dev/ko/` 200, `http://` → `https://`(`.dev`는 HTTPS만)
- 레터 보내기 → `letters@bettercurl.dev` → 개인 메일함 도착, 발신 `yhy <letters@mail.bettercurl.dev>`, 회신 주소는 방문자
- 어드민 답장 → 방문자 주소로 도착(Resend 로그 Delivered)
- 관리자 Google 로그인·이메일 로그인 정상
- 챗 "연락처 알려줘" → `hello@bettercurl.dev`(개인 Gmail이 나오지 않는다)
