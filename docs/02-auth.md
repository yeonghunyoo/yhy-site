# 2단계 · 인증

Better Auth를 Workers에서 돌리고, 세션은 D1, 메일은 Resend, 소셜은 Google 하나만 붙인다. 비밀번호는 아예 받지 않는다.

## 구성

| 요소 | 선택 | 비고 |
| --- | --- | --- |
| 라이브러리 | Better Auth | Astro 통합·D1(Drizzle) 어댑터·magic-link 플러그인 있음 |
| 이메일 로그인 | 매직링크 (비밀번호 없음) | 링크 유효 15분, 1회용 |
| 소셜 | Google OAuth | 콜백 `/auth/callback/google` |
| 세션 | DB 세션, 쿠키 `HttpOnly; Secure; SameSite=Lax` | 만료 30일, 활동 시 갱신 |
| 메일 발송 | Resend | 무료 3,000통/월, Workers fetch로 호출, 발신 도메인 DKIM 설정 필요 |
| 관리자 판별 | `ADMIN_EMAILS` 환경변수 허용목록 | 역할 테이블 없음, 1인 운영 전제 |

## 매직링크 흐름

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
- Google OAuth는 Google 쪽 제한에 맡김

## 본인이 해야 하는 설정

- [ ] Google Cloud Console에서 OAuth 클라이언트 2개 생성 — 운영용(승인된 리디렉션 URI에 운영 도메인만), 로컬용(`localhost`만). 로컬용 값은 `.dev.vars`에만 둔다
- [ ] Resend 계정 + 발신 도메인 DNS(DKIM·SPF) 등록 — 도메인 확정 후 가능

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
- 복귀: `callbackURL`은 `{현재 경로}?signed_in=1{#해시}`. 복귀 후 `pendingAction`이 있으면 그 시트를, 없으면 토스트를 띄우고 파라미터를 지운다

## 완료 기준

- 매직링크·Google 두 경로로 로그인·로그아웃이 모바일에서 동작
- 레이트리밋 초과 시 안내 문구가 뜬다
