# 개발 작업 계획 — 1차 웹(서버)

2026-11-04 작성, **11/06 다시 정리**. 목표·순서의 기준은 [service-plan.md](service-plan.md), 결정 이유는 [decisions.md](decisions.md). 이 문서는 **그 순서를 코드·사람 작업 단위로 쪼갠 것**입니다.

- 맨 위 "남은 일"이 할 일 목록 전부입니다. 끝내면 `[x]`로 바꾸고 날짜를 붙인 뒤, 아래 "끝낸 것"의 해당 번호로 옮깁니다
- "사람"은 Claude가 할 수 없고 사용자가 해야 하는 일, "코드"는 바로 구현할 수 있는 일입니다. ①~⑧ 번호는 service-plan.md "순서"와 같습니다

## 상태 (11/06)

| 단계 | 상태 |
|---|---|
| 1차 웹(서버) | **코드로 할 수 있는 큰 항목은 끝남(11/05)** — ②③⑤⑦⑧, 검색 noindex, 보안 제안 5가지. 로컬 Postgres로 스모크 93개·E2E 6개 통과. 남은 것은 사람 작업이 먼저인 ①계정 이전·④약관·⑥Apple 로그인과 도메인, 그리고 작은 코드 3가지 |
| 2차 모바일 | 대기 |
| 3차 동영상·분류 | 대기(제안 V1~V11) |

## 남은 일 (11/06 기준)

### A. 지금 바로 할 수 있는 코드
- [x] **② 용량이 찼을 때 소유자에게 알림** (11/06) — Space 업로드가 소유자 용량 때문에 막히면(413) 피드에 "저장 공간이 가득 찼어요"(Space당 하루 한 번, 실시간 반영). Space·라이브러리 화면에 90% 이상 경고. 메일은 nuvo Resend 계정(①) 뒤에
- [x] **미룬 DB 작업 뒤에 연결 닫기** (11/06) — 응답 뒤로 미룬 메일(예산 카운터를 DB에 씀)이 연결이 먼저 닫혀 실패할 수 있던 문제. 운영 인증 메일에도 해당했음. `c.var.defer`로 미룬 일이 끝난 뒤 닫음
- [x] **③ 스토어 결제 통지 라우트 자리 예약** (11/06) — `/api/billing/apple`, `/api/billing/google`이 501만 돌려줌(아무것도 믿지 않고 바꾸지 않음). 2차 구현 메모(JWS 검증, Pub/Sub OIDC 검증 후 Play API 재조회, 멱등)는 `worker/routes/billing.ts` 주석
- [x] **⑦ 운영자용 계정 삭제** (11/06, D-022) — 탈퇴 로직을 `worker/lib/account.ts`로 떼어 본인 탈퇴와 공유. 운영자 경로 `POST /api/admin/delete-account`(`ADMIN_TOKEN`, 없으면 404) + `scripts/admin-delete-account.mjs`(기본 미리보기, `--yes`로 삭제, `--transfer`로 공유 Space 소유권 이전). 삭제하면 열린 삭제 요청이 자동 처리됨. 운영 토큰 만들기는 사람([developer-guide.md](developer-guide.md) "계정 삭제 요청")

- [x] **E2E 픽스처 OS 무관** (11/06) — macOS `sips` 대신 캔버스 축소본 + 레포의 작은 HEIC(`e2e/assets/iphone.heic`). 클라우드 세션(Linux)에서도 `pnpm nuvo e2e` 바로 실행

- [x] **2차 준비: 모바일 방식 비교** (11/06) — [mobile-options.md](mobile-options.md): Capacitor vs Expo(사진첩·백그라운드 업로드·구독·로그인·4.2 심사·재사용), 기기 간 같은 사진 판정 3단계 제안. 조사상 Expo 유리, 결정은 시제품 뒤(D-023)

- [x] **SEO·GEO 1단계** (11/10, D-024) — [seo.md](seo.md): 파비콘·아이콘·매니페스트, OG 이미지, 정적 랜딩(스크립트 없이 본문), 화면별 나눠 불러오기(첫 JS 200→114KB), JSON-LD·`llms.txt`, robots·sitemap(도메인 변수), 점검 `scripts/seo-check.mjs`
- [ ] **SEO·GEO 남은 것** — 랜딩 문구·FAQ를 지금 방향으로(가격·약관과), 도메인 뒤 `NUVO_SITE_URL`로 배포·검색 콘솔 등록, 앱 뒤 배너·유니버설 링크 ([seo.md](seo.md) 순서 2~4)

### B. 사람 작업이 먼저인 것
- [ ] **도메인 결정·연결** ([developer-guide.md](developer-guide.md) 10단계) — 이게 풀리면 따라오는 코드·설정:
  - `SUPPORT_EMAIL` 값 채우기(지금 비어서 연락처 숨김·신고 메일 건너뜀, ⑤)
  - `BETTER_AUTH_URL` 바꾸고 다시 배포, Google OAuth 리디렉션 URI 추가
  - 스토어 등록정보에 `https://<도메인>/account/delete`(⑦)
- [ ] **① 계정 이전** — nuvo용 Cloudflare 계정
  - [ ] 사람: 계정 생성 → `wrangler.jsonc`에 `account_id`
  - [ ] 사람: R2 버킷·Hyperdrive·비밀값·cron을 새 계정에 다시 만들기 ([developer-guide.md](developer-guide.md) 5~9·11단계)
  - [ ] 사람: nuvo용 Resend 계정 → `RESEND_API_KEY` 운영 투입(지금은 공용 계정이라 비워 둠)
  - [ ] 코드 후속: `STORAGE_CAP_GB` 제거(또는 0), 비용 알림을 대시보드에서 설정(15단계), `mvp.md`·site `cost-guard.md`의 "계정 공용 한도" 표 삭제, `docs/monorepo.md` 계정 표 갱신
- [ ] **④ 약관·개인정보처리방침** (+⑤ 약관 동의)
  - [ ] 사람: 문구 결정(가능하면 전문가 검토) — 수집 항목(사진·위치 EXIF·카메라), 국외 이전(Cloudflare·Neon), Space에 올린 사진은 남음, 구독·해지·환불(스토어 기준), 해지 후 보관 기간, 운영자의 기술적 접근 가능성([media-security.md](media-security.md) 1.1), 신고 처리 기한, 원본 EXIF 위치는 지우지 않음(2.1 (a)). 체크 항목은 [developer-guide.md](developer-guide.md) 14단계
  - [ ] 코드: `/terms`·`/privacy` 정적 페이지, 가입·첫 업로드 때 동의 기록(userId·버전·시각)
- [ ] **⑥ Sign in with Apple**
  - [ ] 사람: Apple Developer Program 가입($99/연), Services ID·키 발급, **서버 간 알림 엔드포인트** 등록(한국 개발자 필수)
  - [ ] 코드: Better Auth에 Apple 제공자 추가, 웹 로그인 화면에 버튼, 계정 삭제 때 Apple 토큰 폐기, 알림 엔드포인트 라우트

### C. 운영 배포와 배포 뒤 확인 (배포는 요청할 때만)
- [ ] **11/05~11/10 코드를 운영에 반영 (11/10: 아직 안 함 — git `main`에만 있음, 자동 배포 없음)** — 운영 Neon에 마이그레이션 **0004~0007** 적용 → 배포(도메인 있으면 `NUVO_SITE_URL`) → 운영자 계정 수동 구독 켜기. 정할 것(배포할 계정·누가 배포·CI)과 순서는 [developer-guide.md](developer-guide.md) "배포 대기"·"11/05 코드 배포 순서"
- [ ] 응답 헤더 실측: `X-Robots-Tag: noindex`(`/` 외, `/api/*`·`/m/*`), CSP(D-021)
- [ ] 실기기 검증([developer-guide.md](developer-guide.md) 17단계): iOS Safari 업로드 메타데이터, 대용량 폴더 스캔, HEIC 속도, 저사양 3D, 두 사람 동시 업로드 알림

### D. 정해야 할 것 (코드에 영향)
- [ ] 구독 가격 — D-013 제안(A ₩2,900 / B ₩1,900 / C ₩3,900+30GB), [pricing.md](pricing.md)
- [ ] 구독 해지 후 사진 보관 정책 — ④ 약관 문구에도 필요
- [ ] Space 공유 원본의 EXIF 위치: 지금 (a) 안내만. (b) 제거본 업로드 / (c) 다운로드 시 제거, Space 다운로드 기본 끔은 미결 ([media-security.md](media-security.md) 2.1)
- [ ] 초대 링크 기본값 7일·최대 10명 유지 여부
- 나머지(모바일 감싸는 방식, 기기 간 같은 사진 판정)는 2차 전에 — [service-plan.md](service-plan.md) "정할 것"

### E. 때가 되면 (계기가 생길 때)
- [ ] QR 코드(PC에서 휴대폰으로 앱 받기) — 스토어 링크가 생기면(⑧)
- [ ] CSP에 `media-src` 추가 — 동영상(3차) 때 (D-021)
- [ ] 운영자 신고 처리 화면 — 1차는 DB 직접(D-018). 신고가 쌓이면
- [ ] 서버 썸네일 생성(Cloudflare Images) — 외부 클라우드 연동 단계([mvp.md](mvp.md) "알려진 한계")

## 끝낸 것 (1차 웹)

### ② 용량 모델 (11/05)
- [x] `PERSONAL_QUOTA_GB` 2 → **10**. `SPACE_QUOTA_GB` **제거** — Space 라이브러리 `quota_bytes` 0, 소유자의 개인 한도에서 차감(D-016·D-017). 마이그레이션 0004
- [x] 업로드 허용 조건 = (구독자 and 자기 사진함) **or** (Space 멤버 and 소유자 구독 and 소유자 한도 남음) — `worker/lib/capacity.ts` `assertUploadAllowed`. prepare·blob·complete·copy 모두 거침
- [x] 화면: 설정에 구독 상태·"내 사진함 + 내가 만든 Space" 용량, Space 화면에 소유자 용량·구독 종료 안내, 업로드 큐 402 처리
- [x] 스모크 테스트 갱신: 402, 가족 업로드 → 소유자 차감, 구독 켬/끔. 로컬 Postgres로 스모크 93개·E2E 6개 통과
- 관련 코드: `worker/lib/capacity.ts`, `worker/routes/uploads.ts`, `wrangler.jsonc` vars, `packages/nuvo-shared` 상수

### ③ 구독 상태 모델 (11/05)
- [x] `packages/nuvo-db` `subscriptions` 표 + 마이그레이션 0004
- [x] `worker/lib/subscription.ts` `subscriptionOf` 하나로 판단. 소유자 구독이 끝나면 보기 유지·올리기만 막음(D-017)
- [x] 1차는 `manual`만: 로컬 `POST /api/dev/subscribe`, 운영은 SQL([developer-guide.md](developer-guide.md) "수동 구독")
- [x] `GET /api/me`에 `subscription` 포함, Space 조회에 `ownerSubscribed`
- 중복 구독 방지·해지는 2차(스토어 연동 때)

### ⑤ 신고·차단·공개 연락처 (11/05, D-018)
- [x] 사진·멤버 **신고**: 사유 5가지(부적절·개인정보·괴롭힘·아동 안전·기타) → `reports` 표 → Space 관리자에게 "신고 N" 버튼·목록, 운영자에게 메일(`SUPPORT_EMAIL`, 아동 안전은 [긴급]). 하루 20건 제한. 관리자는 "처리함 / 문제 없음"으로 닫음
- [x] 멤버 **차단**: 내보내기 + 차단(`?block=1`) → `space_blocks` 표, 초대 링크로 재참여 403. 관리자가 차단 목록에서 풀 수 있음
- [x] **공개 연락처**: `SUPPORT_EMAIL` → `GET /api/config`, 랜딩 바닥·설정 "문의"·신고 창에 표시(비면 숨김). 값은 도메인 때(B)
- [x] 신고 알림을 피드에는 올리지 않음(멤버 모두에게 보이므로) — 관리자 화면 버튼으로 대신(D-018)
- 근거: 두 스토어 UGC 정책([media-security.md](media-security.md) 3.3·4.4). 약관 동의는 ④로

### ⑦ 계정 삭제 웹 페이지 (11/05, D-019)
- [x] `/account/delete`: 무엇이 지워지고 남는지, 구독은 스토어에서 따로 해지, 로그인돼 있으면 바로 삭제, 아니면 "로그인하고 삭제". 설정에서 링크
- [x] 로그인 못 하는 사용자의 요청 폼 → `POST /api/account-deletion-requests` → `deletion_requests` 표 + 운영자 메일. 응답은 항상 같음(가입 여부 비노출), 같은 이메일 하루 1번, 전체 시간당 30건. 처리는 운영자 수동

### ⑧ "앱에서 구독" 안내 (11/05, D-020)
- [x] 구독 없는 사용자가 "올리기"(내 사진함)·끌어다 놓기·"새 Space"를 누르거나 서버가 402를 주면 **"앱에서 구독" 안내 창**: 스토어 링크(`APP_STORE_URL`·`PLAY_STORE_URL`, 비면 "앱 준비 중" + 문의 메일). Space 소유자 구독 종료는 "소유자에게 알려 주세요"로 따로
- [x] 설정에 구독 상태 표시 (②③ 때)

### 검색 노출 기본 noindex (11/05, D-004)
- [x] `public/_headers`에 `/` 외 `X-Robots-Tag: noindex`, Worker `/api/*`·`/m/*` 응답에도. robots.txt. `index.html`에 description·OG([mvp.md](mvp.md) "검색 노출"). 배포 뒤 실측은 C

### 보안 제안 중 1차에 넣은 것 (11/05, [media-security.md](media-security.md))
- [x] Space로 보낼 때·Space에 직접 올릴 때 DB 위치(lat/lng) 기본 저장 안 함 + 보내기 창의 "찍은 장소도 함께 보내기" 옵션 (2.1, D-016). 원본 파일 EXIF는 그대로 — 화면에 그렇게 안내(선택지 a)
- [x] 업로드 매직 넘버 검사 (1.2) — `worker/lib/sniff.ts`, 앞 12바이트로 JPEG·PNG·GIF·WebP·HEIC/HEIF/AVIF(ftyp 브랜드) 확인, 헤더와 계열이 다르면 415. 단위 테스트
- [x] SPA CSP (5.2) — `public/_headers`에 `default-src 'self'` 기반 전체 정책, 인라인 테마 스크립트는 `public/theme-init.js`로. HEIC 디코더 때문에 `'unsafe-eval'`·`worker-src blob:` 필요(D-021). 검사 스크립트 `scripts/csp-check.mjs`
- [x] 세션 목록·개별 로그아웃 (5.4) — 설정 "로그인한 기기": 기기 이름·마지막 사용·IP 앞 두 자리, 다른 기기 하나/모두 로그아웃. 자체 API(`/api/me/sessions`)로 토큰을 브라우저에 내보내지 않음
- [x] 초대 링크 즉시 끊기 (2.3) — 초대 창에 "쓰는 중인 초대 링크" 목록과 "끊기"(만료 처리), 관리자만. "누가 어느 링크로 들어왔는지"는 하지 않음 — 참여는 피드에 이미 남음

### 코드 전에 정한 것 (11/05, D-016)
- [x] 구독 없는 가족(Space 멤버)도 소속 Space에 올리기 가능
- [x] Space 용량은 소유자의 10GB에서 차감
- [x] Space로 보낼 때 위치 기본 복사 안 함, "위치도 공유" 선택 옵션
- 시작 순서는 D-015 제안대로 ②+③ → ⑤·⑦·⑧ → noindex·보안 제안으로 진행했음

## 2차 모바일 (요약, 상세는 때가 되면)
방식 결정(시제품, [mobile-options.md](mobile-options.md) — 조사상 Expo 유리) → 앱 기본 + 사진첩 보기 + 초대받은 Space 보기 → iOS IAP·Google Play 결제 + 영수증 검증·서버 간 통지(③의 예약 라우트) → 백업(골라서 → 자동, WorkManager / URLSession 백그라운드) → 스토어 심사 문서(Privacy Manifest, Data safety, 사진 권한 선언 폼, 연령 등급, CSAE 범위 밖 확인)
