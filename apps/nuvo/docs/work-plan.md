# 개발 작업 계획 — 1차 웹(서버)

2026-11-04 작성. 목표·순서의 기준은 [service-plan.md](service-plan.md), 결정 이유는 [decisions.md](decisions.md). 이 문서는 **그 순서를 코드·사람 작업 단위로 쪼갠 것**이고, 끝낸 항목은 `[x]`로 바꿉니다.

## 상태 (11/04)

| 단계 | 상태 |
|---|---|
| 1차 웹(서버) | **시작 전.** 문서·결정 정리 완료 |
| 2차 모바일 | 대기 |
| 3차 동영상·분류 | 대기(제안 V1~V11) |

## 1차 웹(서버)

"사람"은 Claude가 할 수 없고 사용자가 해야 하는 일, "코드"는 바로 구현할 수 있는 일입니다. 번호는 service-plan.md "순서"와 같습니다.

### ① 계정 이전 — 사람
- [ ] nuvo용 Cloudflare 계정 생성 → `wrangler.jsonc`에 `account_id`
- [ ] R2 버킷·Hyperdrive·비밀값·cron을 새 계정에 다시 만들기 ([developer-guide.md](developer-guide.md) 5~9·11단계)
- [ ] nuvo용 Resend 계정 생성 → `RESEND_API_KEY` 운영에 투입(지금은 공용 계정이라 비워 둠)
- [ ] 코드 후속: `STORAGE_CAP_GB` 제거(또는 0), 비용 알림을 대시보드에서 설정(15단계), `mvp.md`·site `cost-guard.md`의 "계정 공용 한도" 표 삭제, `docs/monorepo.md` 계정 표 갱신

### ② 용량 모델 — 코드
- [ ] `PERSONAL_QUOTA_GB` 2 → **10**. `SPACE_QUOTA_GB`는 "Space 용량을 누구 몫으로 셀지" 결정에 따라: 소유자 몫이면 **제거**하고 Space 업로드도 소유자의 개인 한도에서 차감
- [ ] 업로드 허용 조건에 **구독 상태** 추가: 구독자만 자기 라이브러리·자기 Space에 업로드. 초대받은 가족의 Space 업로드는 "올리기 허용" 결정에 따름(제안: 허용, 소유자 한도 차감)
- [ ] 한도 초과 응답(지금 507)과 화면 안내 문구를 "구독 용량"에 맞게. 구독 없는 사용자에게는 "앱에서 구독" 안내(⑧)
- [ ] 스모크 테스트 갱신(용량·구독 시나리오)
- 관련 코드: `worker/lib/capacity.ts`, `worker/routes/uploads.ts`, `wrangler.jsonc` vars, `packages/nuvo-shared` 상수

### ③ 구독 상태 모델 — 코드
- [ ] `packages/nuvo-db`에 `subscriptions` 표: userId, source(`manual` / `apple` / `google`), productId, status(active/grace/expired), currentPeriodEnd, 원본 식별자(originalTransactionId / purchaseToken), 갱신 시각. 마이그레이션
- [ ] "이 계정은 구독자" 판단 함수 하나(`worker/lib/subscription.ts`): active 또는 grace면 참. 웹·앱·업로드 검사가 모두 이 함수만 봄
- [ ] 1차는 **운영자가 수동으로 켜는 `manual`** 행만. 켜고 끄는 건 DB 직접 또는 작은 관리자 스크립트(`scripts/`)
- [ ] API: `GET /api/me`에 구독 상태(source·만료일) 포함 → 화면이 "구독 중 / 앱에서 구독" 분기
- [ ] 2차를 위한 자리만: Apple App Store Server Notifications·Google RTDN을 받을 라우트 경로 예약(`/api/billing/apple`, `/api/billing/google`) — 구현은 2차
- 중복 구독 방지·해지는 2차(스토어 연동 때)

### ④ 약관·개인정보처리방침 — 사람 → 코드
- [ ] 문구 결정(가능하면 전문가 검토): 수집 항목(사진·위치 EXIF·카메라), 국외 이전(Cloudflare·Neon), Space에 올린 사진은 남음, 구독·해지·환불(스토어 기준), 해지 후 보관 기간, 운영자의 기술적 접근 가능성([media-security.md](media-security.md) 1.1), 신고 처리 기한
- [ ] 코드: `/terms`·`/privacy` 정적 페이지, 가입·첫 업로드 때 동의 기록(userId·버전·시각)

### ⑤ 신고·차단·공개 연락처·약관 동의 — 코드
- [ ] Space 사진 **신고**: 사유 선택 → `reports` 표 → Space 소유자와 운영자에게 알림(피드 + 메일). 운영자 처리 화면은 1차엔 DB 직접
- [ ] 멤버 **차단**: 소유자·관리자가 멤버를 차단하면 내보내기 + 재초대 불가(`space_members`에 blocked 또는 별도 표)
- [ ] **공개 연락처**: 지원 이메일을 랜딩·설정·약관에 표시
- [ ] 약관 동의는 ④와 함께
- 근거: 두 스토어 UGC 정책([media-security.md](media-security.md) 3.3·4.4)

### ⑥ Sign in with Apple — 사람 → 코드
- [ ] 사람: Apple Developer Program 가입($99/연), Services ID·키 발급, **서버 간 알림 엔드포인트** 등록(한국 개발자 필수)
- [ ] 코드: Better Auth에 Apple 제공자 추가, 웹 로그인 화면에 버튼, 계정 삭제 때 Apple 토큰 폐기, 알림 엔드포인트 라우트

### ⑦ 계정 삭제 웹 페이지 — 코드
- [ ] 로그인 후 삭제(지금 설정 화면과 같은 흐름)를 **앱 밖에서도 열리는 URL**(`/account/delete`)로. 페이지에 앱·개발자 이름 표시(Play 요건)
- [ ] 로그인 못 하는 사용자를 위한 요청 폼(이메일) — 처리는 운영자 수동

### ⑧ "앱에서 구독" 안내 — 코드
- [ ] 구독 없는 사용자가 업로드·Space 만들기를 시도하면 안내 화면: 스토어 링크(앱 출시 전엔 "준비 중")·QR 자리
- [ ] 설정에 구독 상태 표시(③의 `/api/me`)

### 검색 노출(기본 noindex) — 코드, 순서 무관
- [ ] `public/_headers`에 `/` 외 `X-Robots-Tag: noindex`, Worker `/api/*`·`/m/*` 응답에도. robots.txt. `index.html`에 description·OG([mvp.md](mvp.md) "검색 노출")

### 보안 제안 중 1차에 넣을 것 — 코드 ([media-security.md](media-security.md))
- [ ] Space로 보낼 때 DB 위치(lat/lng) 복사 안 함 (2.1, 제안 확정 필요)
- [ ] 업로드 매직 넘버 검사 (1.2)
- [ ] SPA `script-src` CSP (5.2)
- [ ] 세션 목록·개별 로그아웃 (5.4)
- [ ] 초대 링크 즉시 무효화 (2.3)

## 시작 순서 제안

1. **②+③** 용량·구독 상태 모델 — 계정 이전과 무관하게 바로 가능, 나머지가 이 위에 올라감
2. **⑤·⑦·⑧** 신고·차단·삭제 페이지·안내 — 스토어 요건, 코드만으로 됨
3. 검색 noindex, 보안 제안 — 작고 독립적
4. **①·④·⑥**은 사람 작업이 끝나는 대로 끼워 넣음

## 코드 전에 정할 것 (②·③에 영향)
- [ ] 구독 없는 가족이 Space에 올리기도 되는지 (제안: 가능)
- [ ] Space 용량은 소유자의 10GB에서 차감 (제안: 예)
- [ ] Space로 보낼 때 위치 복사 안 함 (제안: 예)

## 2차 모바일 (요약, 상세는 때가 되면)
Capacitor 감싸기 → 사진첩 보기 + 초대받은 Space 보기 → iOS IAP·Google Play 결제 + 영수증 검증·서버 간 통지(③의 예약 라우트) → 백업(골라서 → 자동, WorkManager / URLSession 백그라운드) → 스토어 심사 문서(Privacy Manifest, Data safety, 사진 권한 선언 폼, 연령 등급, CSAE 범위 밖 확인)
