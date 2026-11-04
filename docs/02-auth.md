# 2단계 · 인증

Better Auth를 Workers에서 돌리고, 세션은 D1, 메일은 Resend, 소셜은 Google 하나만 붙인다. 비밀번호는 아예 받지 않는다.

## 구성

| 요소 | 선택 | 비고 |
| --- | --- | --- |
| 라이브러리 | Better Auth | Astro 통합·D1(Drizzle) 어댑터·magic-link 플러그인 있음 |
| 이메일 로그인 | 매직링크 + 6자리 인증 코드 (비밀번호 없음, 11/03 코드 추가) | 둘 다 같은 메일, 유효 15분, 1회용. 코드는 해시로 저장, 3번 틀리면 무효 |
| 소셜 | Google OAuth | 콜백 `/auth/callback/google` |
| 세션 | DB 세션, 쿠키 `HttpOnly; Secure; SameSite=Lax` | 만료 30일, 활동 시 갱신 |
| 메일 발송 | Resend | 무료 3,000통/월, Workers fetch로 호출, 발신 도메인 DKIM 설정 필요 |
| 관리자 판별 | `ADMIN_EMAILS` 허용목록(최고 관리자) 또는 D1 `user.is_admin` | 11/04 DB 지정 추가 — 비밀을 바꾸지 않고 어드민 화면에서 관리자를 더하고 뺀다. 역할 테이블 없이 열 하나 |

## 매직링크 + 인증 코드 흐름 (11/03)

로그인 쿠키는 브라우저마다 따로라, 메일 앱이 링크를 **인앱 브라우저**(카카오톡·Gmail 앱 안 화면)로 열면 로그인은 그 화면에만 되고 사용자가 쓰던 Safari·Chrome은 로그아웃 상태로 남는다. 다른 기기(PC에서 요청 → 폰으로 메일 확인)도 같다. 그래서 같은 메일에 **6자리 코드**를 함께 보내고, 요청한 브라우저의 로그인 시트에서 코드를 입력해 로그인할 수 있게 한다(Slack·Notion·Vercel과 같은 방식). 링크를 같은 브라우저에서 열면 지금처럼 바로 로그인된다.

1. 로그인 시트에서 이메일 입력 → `POST /auth/sign-in/magic-link` (지금과 같음)
2. `sendMagicLink`가 링크와 함께 서버 전용 `auth.api.createVerificationOTP({ email, type: 'sign-in' })`로 코드를 만들어 같은 메일에 넣는다(Better Auth `emailOTP` 플러그인 — 코드는 D1 `verification`에 해시로, 유효 15분)
3. 시트는 "메일을 보냈어요" 상태에서 코드 입력칸을 보여 준다(`inputmode=numeric`, `autocomplete=one-time-code`, 16px 글자)
4. 코드 입력 → `POST /auth/sign-in/email-otp { email, otp }` → 세션 쿠키 → `{현재 경로}?signed_in=1{#해시}`로 다시 불러 기존 복귀·재개 흐름(`pendingAction`)을 그대로 탄다
5. 링크로 로그인하든 코드로 로그인하든 결과는 같다. 한쪽을 쓰면 다른 쪽은 만료 시각까지 남는다(같은 메일함을 가진 사람만 쓸 수 있어 위험이 늘지 않는다)
- 쓰지 않는 `emailOTP` 엔드포인트(`/email-otp/*`, `/forget-password/email-otp` — 코드 단독 발송·확인·이메일 변경 등)는 `hooks.before`에서 404로 막는다. 코드 발송은 매직링크 요청 한 경로로만 일어나 기존 레이트리밋을 그대로 받는다
- 오류: 틀린 코드 / 3번 틀려 무효 / 만료 → 시트에 안내, 만료·무효면 "다시 보내기"

### 매직링크 흐름 (10/29, 링크만 쓸 때)

1. 로그인 모달에서 이메일 입력 → `POST /auth/sign-in/magic-link`
2. Better Auth가 토큰 생성·D1 `verification` 저장 → Resend로 링크 메일 발송
3. 사용자가 링크 클릭 → `/auth/magic-link/verify?token=…` → 세션 생성, 쿠키 발급 → 원래 페이지(`callbackURL`)로 복귀
4. 첫 로그인이면 `user` 레코드 자동 생성

## Resend 선택 이유 (비교)

| 서비스 | 무료 한도 | Workers 궁합 | 판단 |
| --- | --- | --- | --- |
| Resend | 3,000통/월, 100통/일 | REST + 공식 SDK, Workers 예제 많음 | 채택 |
| Postmark | 100통/월 | REST | 무료 한도가 작음 |
| Brevo | 300통/일 | REST | 한도는 넉넉하나 트랜잭션 메일 UX·문서가 약함 |
| Cloudflare Email Routing | 수신 전용 | 네이티브 | 발송 불가, 레터 수신 주소로만 활용 가능 |

## 남용 방지

- 매직링크 요청: IP당 10분에 3회 (KV 카운터)
- 같은 이메일: 10분에 1회
- 인증 코드 입력: 코드 하나당 3번 틀리면 무효(Better Auth `allowedAttempts`), 그와 별개로 IP당 10분에 10회(KV `otp:ip:*`) — 6자리 코드 대입 방지
- Google OAuth는 Google 쪽 제한에 맡김

## 본인이 해야 하는 설정

- [x] Google Cloud Console에서 OAuth 클라이언트 1개 생성(10/29, 프로젝트 `portfolio-web-yhy`) — 로컬·운영 공용. 승인된 리디렉션 URI에 `localhost`와 운영 주소를 함께 등록하고, 같은 값을 `.dev.vars`와 `.prod.vars`에 둔다. 1인 프로젝트라 클라이언트를 나누는 이득보다 관리 부담이 커서 공용으로 바꿨다
- [ ] Resend 계정 + 발신 도메인 DNS(DKIM·SPF) 등록 — 도메인 전에는 테스트 발신(`onboarding@resend.dev`)으로 관리자 본인만 가능. 절차는 [guides/resend-setup.md](guides/resend-setup.md)

## 상세 설계 (확정)

**로그인 후 복귀·재개**

1. 보호된 동작(레터 보내기 등)을 누르면 클라이언트가 `sessionStorage.pendingAction = {type:'letter', draft}`를 저장하고 로그인 시트를 연다
2. 매직링크·Google 모두 `callbackURL`에 현재 경로(`/ko#contact` 등)를 실어 보낸다
3. 복귀 후 레이아웃 스크립트가 `pendingAction`을 읽어 해당 시트를 자동으로 다시 열고 초안을 복원한 뒤 키를 지운다
4. 매직링크를 다른 기기(폰 메일 → PC 사이트)에서 열면 `pendingAction`이 없으므로 그냥 복귀만 한다 — 이 경우 "로그인됐어요, 하던 작업을 이어가세요" 토스트

**로그아웃·세션**

- 로그인 상태는 헤더 우측 아바타(이니셜) → 메뉴: 내 레터 보기(2차), 계정 삭제, 로그아웃
- 세션 만료(30일) 후 보호 API가 401을 주면 클라이언트는 조용히 로그인 시트를 띄우고 `pendingAction` 흐름으로 복귀시킨다 — 에러 화면 없음
- 매직링크 만료(15분)·재사용 시: Better Auth가 `errorCallbackURL`(`{현재 경로}?auth_error=1&error=…`)로 보낸다 → 같은 로그인 시트를 "링크가 만료됐거나 이미 쓰였어요. 다시 보낼까요?" 상태로 연다. `error=failed_to_create_session`(차단된 계정)이면 "로그인할 수 없는 계정이에요"

**이메일 템플릿**: 플레인 텍스트에 가까운 단순 HTML. 로고 없음, 본문 3문장 + 버튼 1개 + 버튼이 안 되면 쓸 원문 링크. 한/영은 요청 시 `locale`로 분기. 제목 `[사이트명] 로그인 링크` / `[사이트명] 답장이 도착했어요`. React Email 쓰지 않고 템플릿 문자열 함수 2개(`magicLinkEmail`, `replyEmail`)로 관리.

**개인정보처리방침 + 계정 삭제**

- `/ko/privacy`, `/en/privacy` 정적 페이지: 수집 항목(이메일, 레터 본문, 로그인 방식), 목적, 보관 기간(계정 삭제 시까지 / 챗 로그 90일), 삭제 방법, 연락처. 레터 시트 하단과 푸터에서 링크
- 계정 삭제: 아바타 메뉴 → 확인 시트에서 "삭제" 입력 → `DELETE /api/account`
- 삭제 처리(트랜잭션): `session`·`account`·`verification` 삭제 → `letters`·`letter_replies`의 `user_id`를 NULL, `reply_to`를 NULL로 비움(본문은 내 기록으로 유지) → `chat_logs.user_id` NULL → `user` 삭제 → 쿠키 제거 → 홈으로
- 삭제 사실은 Telegram으로 나에게 알림(이메일 없이 "계정 1건 삭제"만)

## 구현 메모 (10/29)

- 핸들러: `src/pages/auth/[...all].ts`, Better Auth `basePath: '/auth'`. 설정은 `src/lib/server/auth.ts`
- DB: Drizzle 어댑터(`provider: 'sqlite'`) + D1. 인증 테이블 스키마는 Better Auth CLI로 생성(`src/db/auth-schema.ts`, `scripts/auth-schema.config.ts`)
- 남용 방지: Better Auth `hooks.before`에서 `/sign-in/magic-link`만 KV로 센다(`ml:ip:{ip}` 3회, `ml:email:{email}` 1회 / 10분). 초과 시 429 → 시트에 안내 문구
- 차단: `user.is_blocked`가 1이면 `databaseHooks.session.create.before`가 세션 생성을 거부한다(새 로그인 불가)
- 로그인 수: `databaseHooks.session.create.after`가 KV `stats:login:{KST 날짜}`를 1 올린다(어드민 지표용)
- Google 키가 없으면 Google 버튼은 "아직 준비 중" 안내를 띄운다. 키를 넣으면 코드 수정 없이 동작
- 메일·Telegram 키가 없으면(로컬) 링크·알림을 콘솔에 출력한다
- 매직링크 발송 실패(11/01): Resend 사유를 `[mail] magic link failed: …` 로그와 Telegram `⚠️ Resend 실패`로 남기고, 같은 이메일 카운터(`ml:email:*`)를 지워 바로 재시도할 수 있게 한다. IP 카운터는 유지. 시트에는 일반 오류 문구
- 로컬 검증(11/01, wrangler dev): 요청 200 → 링크로 302 복귀(`?signed_in=1#해시`) + 세션 쿠키 → 재사용 시 `?auth_error=1&error=INVALID_TOKEN` → 로그아웃 → 같은 이메일 재요청 429. 실제 메일 수신은 Resend 키를 넣은 뒤 확인
- 인증 코드(11/03): `emailOTP` 플러그인(`otpLength 6`, `expiresIn 15분`, `allowedAttempts 3`, `storeOTP 'hashed'`). 코드는 `sendMagicLink` 안에서 `auth.api.createVerificationOTP`로 만들어 링크 메일에 넣고(제목에도 코드), 플러그인의 단독 발송 콜백은 쓰지 않는다. 클라이언트는 플러그인 없이 `authClient.$fetch('/sign-in/email-otp')`로 부른다(번들 증가 없음). 로컬 검증(wrangler dev): 메일 1통에 링크+코드 → 틀린 코드 400 `INVALID_OTP` → 맞는 코드 200 + 세션(`emailVerified: true`) → 같은 코드 재사용 400 → 3번 틀린 뒤 맞는 코드 403 `TOO_MANY_ATTEMPTS` → 같은 메일의 링크는 그대로 302 로그인 → `/email-otp/send-verification-otp`·`check-verification-otp` 404. 브라우저(iPhone 13 크기): 시트에서 코드 입력 → `?signed_in=1` 복귀 + "로그인됐어요" 토스트
- 복귀: `callbackURL`은 `{현재 경로}?signed_in=1{#해시}`. 복귀 후 `pendingAction`이 있으면 그 시트를, 없으면 토스트를 띄우고 파라미터를 지운다

## 완료 기준

- 매직링크·Google 두 경로로 로그인·로그아웃이 모바일에서 동작
- 메일의 인증 코드로 요청한 브라우저에서 로그인된다(링크를 다른 브라우저에서 연 경우 포함). 틀린 코드·만료·3회 초과 안내가 뜬다
- 레이트리밋 초과 시 안내 문구가 뜬다
