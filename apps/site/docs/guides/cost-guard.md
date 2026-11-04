# 비용·남용 방지 (과금 폭탄 차단기) + 사용량 대시보드

작성 2026-11-03. 목표: **어떤 요청이 몰려도 무료 한도를 넘지 않고, 넘을 것 같으면 기능을 끄는 쪽으로 실패한다.** 돈이 드는 쪽으로 실패하지 않는다.

계정 플랜은 이 레포에서 확인할 수 없다(배포 토큰에 결제 읽기 권한 없음). 그래서 **유료 플랜이어도 무료 한도 안에서 멈추도록** 상한을 잡는다. R2는 결제 수단이 있어야 켜지므로 초과분이 실제로 청구될 수 있다고 본다.

## 1. 자원별 위험과 장치

무료 한도는 2026-11 기준 Cloudflare·Resend 공개 값. 일 단위는 UTC 자정(Cloudflare)·KST 자정(우리 카운터) 기준이 다르다 — 대시보드에 표시한다.

| 자원 | 무료 한도 | 늘리는 것 | 최악의 남용 | 장치 |
| --- | --- | --- | --- | --- |
| Workers 요청 | 하루 10만 | 모든 동적 요청(`/api/*`·`/auth/*`·`/media/*`·`/admin`). 정적 파일은 Worker를 거치지 않는다(assets 우선) | 봇이 `/api/chat`·`/media/*`를 연타 | IP별 순간 제한(분당 60, 초과 반복 시 10분 차단) + 대시보드 WAF 속도 제한 규칙(무료 1개). 무료 플랜이면 넘으면 오류(요금 없음) |
| Workers AI | 하루 1만 뉴런 | 챗 1턴: Llama Guard(약 9) + 슈퍼바이저(약 10) + 임베딩 + 답변(약 20) | 여러 IP로 비로그인 3턴씩 → 하루 수백 턴 | **사이트 전체 일일 상한**: 추정 뉴런 8,000(`AI_DAILY_NEURON_CAP`)·턴 500(`CHAT_DAILY_TURN_CAP`)에서 챗을 멈추고 "오늘은 쉬어요" + 레터. 80%에 Telegram 경고 1회, 100%에 1회. 기존 월 토큰 상한·사용자별 턴 제한은 그대로 |
| KV | 하루 읽기 10만 / **쓰기 1천** | 사용자별 챗 턴 카운터, 로그인 지표, 매직링크·코드 레이트리밋, 메일 카운터, 차단 기록 | 쓰기가 1천을 넘으면 쓰는 기능 전부 오류(챗·로그인) | 요청마다 쓰지 않는다: 월 토큰 누계를 KV에서 D1 `chat_logs` 합계로 옮겨 **챗 1턴 쓰기 2회 → 1회**. 사이트 전체 지표는 D1에서 센다. 차단은 위반이 반복될 때만 1회 쓴다 |
| D1 | 하루 읽기 500만 행 / 쓰기 10만 행 | 챗 로그·레터·세션 | 읽기는 상한 계산이 매 턴 오늘 로그를 훑는다(인덱스 범위) | 상한 계산 결과를 isolate마다 30초 캐시. 쓰기는 턴당 로그 1행 |
| R2 | 월 10GB, A급 100만·B급 1천만 회 | `/media/*` 조회(B급 GetObject), `rag:import` 업로드(A급) | `/media/*` 연타 → B급 조회 | 이름이 내용 해시라 브라우저 영구 캐시(`immutable`). IP별 순간 제한이 `/media/*`에도 걸린다. 업로드는 로컬 CLI만. **저장은 1GB 안**(10GB는 nuvo와 계정 공용, 아래 "계정 공용 한도") — `rag:import` 전에 R2 개요의 계정 합계를 본다. 대시보드 R2 사용량 알림 권장 |
| Vectorize | 월 조회 차원 3천만 / 저장 차원 500만 | 포트폴리오 질문마다 1회 조회(1024차원 × 저장 벡터 수) | 챗 연타 | 챗 일일 상한이 같이 막는다 |
| Resend 메일 | 하루 100통, 월 3,000통 | 로그인 메일, 레터 알림, 관리자 답장 | 여러 이메일로 로그인 메일 요청 | **메일 일일 80통(`MAIL_DAILY_CAP`)·월 2,800통(`MAIL_MONTHLY_CAP`)**: 넘으면 로그인 메일은 `rate_limited`, 레터는 저장만 하고 실패로 표시(관리자가 재전송). 기존 IP·이메일별 제한은 그대로 |
| 레터 | — (메일·D1을 씀) | 로그인 사용자 하루 3통 | 계정 여러 개로 | **사이트 전체 하루 50통(`LETTER_DAILY_CAP`)** |
| Telegram | 무료 | 알림 | 알림 폭주 | 경고·차단 알림은 하루/시간당 1회로 묶는다 |

상한 값은 모두 환경변수로 바꿀 수 있고, 비워 두면 위 기본값을 쓴다.

### 계정 공용 한도 (11/04)

위 무료 한도는 Worker마다가 아니라 **Cloudflare 계정 전체**에 걸린다. 같은 계정의 nuvo(사진 서비스, 이 모노레포의 `apps/nuvo`)와 나눠 쓴다. 같은 표가 `apps/nuvo/docs/mvp.md` "계정 공용 한도"에 있다 — 바꿀 때는 두 곳을 같이 고친다. **임시 배분**이다: nuvo를 새 Cloudflare 계정으로 옮기면(루트 `docs/monorepo.md` "Cloudflare·Resend 계정") 이 표를 지운다.

**Resend**도 같은 계정이다. 두 앱 상한(각 하루 80통)을 합치면 무료 100통을 넘으므로, **Resend 계정을 나누기 전에는 nuvo 운영에 `RESEND_API_KEY`를 넣지 않는다**(nuvo는 키가 없으면 이메일 가입이 꺼지고 Google·카카오만 쓴다).

| 자원 | 계정 무료 한도 | portfolio-web | nuvo | 여유 |
| --- | --- | --- | --- | --- |
| R2 저장 | 10GB | 1GB 안(RAG 원본·이미지, 로컬 CLI로만) | 8GB(`STORAGE_CAP_GB`, 코드로 막음) | 1GB |
| Workers 요청 | 하루 10만 | 상한 없음(IP별 순간 제한) | 상한 없음(크론 하루 96회 포함) | 둘 합이 7만을 넘으면 다시 나눈다 |
| Workers AI | 하루 1만 뉴런 | 8,000(`AI_DAILY_NEURON_CAP`) | 쓰지 않음 | 2,000 |
| D1 · KV · Vectorize | — | 전부 | 쓰지 않음(Postgres·Durable Object) | — |

`/admin/usage`의 Cloudflare 막대는 계정 합계라 nuvo 사용량도 들어 있다.

## 2. 비정상 요청 방어 (`src/lib/server/request-guard.ts`, 미들웨어에서 호출)

동적 요청 중 `/api/*`, `/auth/*`, `/media/*`에만 적용한다(정적 페이지·에셋은 Worker를 거치지 않는다).

1. **차단 목록**: 최근 위반이 반복된 IP(해시)는 10분 동안 429. KV `block:{ipHash}` 읽기 1회
2. **순간 제한**: IP별 분당 60회(`/media/*` 분당 120회). isolate 메모리의 고정 창 카운터 — 같은 IP의 연타는 대부분 같은 위치·isolate로 가서 잡힌다. 넘으면 429, 한 창에서 3번 넘으면 차단 목록에 10분 등록 + Telegram(시간당 1회)
3. **메서드**: 경로별 허용 메서드 밖이면 405(`Allow` 헤더)
4. **본문 크기**: `Content-Length` 16KB 초과(관리자 API 64KB) 413. 챗 질문은 500자, 레터 본문은 앱 상한이 따로 있다
5. **출처 확인**: 상태를 바꾸는 `/api/*` 요청(POST·PUT·PATCH·DELETE)은 `Origin`(없으면 `Referer`)이 사이트 출처와 같아야 한다. 아니면 403. `/auth/*`는 Better Auth가 자체로 확인한다
6. **형식**: JSON을 받는 `/api/*`(관리자 폼 제외)는 `Content-Type: application/json`이 아니면 415
7. **봇 신호(11/04)**: 로그인 없이 열린 `POST /api/letters`·`POST /api/chat`만. 브라우저라면 반드시 보내는 신호가 없으면 403 `bot`(AI·D1·메일 안 씀)
   - `User-Agent`가 없거나 도구·자동화 이름(curl, wget, python, Go-http, Java, okhttp, axios, node-fetch, undici, Scrapy, HeadlessChrome, PhantomJS, Selenium, Puppeteer, Playwright, bot·spider·crawler)
   - `Sec-Fetch-Site`가 `same-origin`이 아님(지원 브라우저 Safari 16.4+·Chrome 111+는 모두 보낸다), `Sec-Fetch-Mode`가 `cors`·`same-origin`이 아님
   - `Accept-Language`가 없음
   - 판정은 `usage-math.ts`의 `botReason()`(순수 함수), 차단은 Telegram `🤖 봇 차단`(시간당 1회). 관리자 API·`/auth/*`는 제외(관리자 스크립트 `rag:sync:remote`는 브라우저가 아니다)
   - 한계: 헤더는 위조할 수 있다 — 브라우저 흉내를 낸 봇은 다음 층(작성 시간, 허니팟, IP 한도, 사이트 상한)이 받는다

**레터 작성 시간(11/04)**: 레터 시트가 열린 뒤 보낼 때까지의 시간(`elapsed`, 밀리초)을 함께 보낸다. 3초 미만이면 허니팟과 같이 저장·발송 없이 성공처럼 응답한다(봇에게 막혔다는 신호를 주지 않는다).

**다음 단계 — Cloudflare Turnstile(설계, 키 발급 후 구현)**: 방문자는 대개 클릭 없이 통과하는 Cloudflare 무료 봇 검사. 대시보드 → Turnstile에서 위젯을 만들어 사이트 키(공개, 빌드 변수 `PUBLIC_TURNSTILE_SITE_KEY`)와 비밀 키(`TURNSTILE_SECRET`)를 받는다. 비밀 키가 있을 때만 켠다 — 레터는 보낼 때마다 토큰 검증(`siteverify`), 챗은 첫 질문에서 한 번 검증하고 6시간짜리 서명 쿠키로 대신한다. 스크립트는 레터 시트·챗을 처음 열 때만 불러 초기 JS 예산을 지키고, CSP에 `https://challenges.cloudflare.com`(script·frame)을 더한다. 로컬은 Cloudflare 테스트 키(항상 통과·항상 실패)로 확인한다

**도메인 연결 후**: Cloudflare 대시보드 → 보안 → Bots → **Bot Fight Mode** 켜기(무료, 도메인 영역 단위라 workers.dev에는 없다)

막힌 요청은 AI·D1·메일을 전혀 쓰지 않는다.

Workers Rate Limiting 바인딩(`ratelimits`)은 무료 플랜 제공 여부를 확인하지 못해(공식 문서에 가격 항목이 없음) 쓰지 않았다 — 바인딩이 없는 플랜이면 배포가 실패한다. 확인되면 2번을 바인딩으로 바꾼다.

## 3. 긴급 차단 스위치

`wrangler secret put 이름`(값 `1`)으로 켜고 `wrangler secret delete 이름`으로 끈다. 배포 없이 바로 적용된다.

| 스위치 | 효과 |
| --- | --- |
| `CHAT_ENABLED` | (기존) 없으면 `/api/chat` 404 |
| `KILL_LOGIN_MAIL` | 로그인 메일 발송 중지 → 로그인 시트에 "요청이 많아요" 안내. Google 로그인은 그대로 |
| `KILL_LETTERS` | 레터 접수 중지(503) |

## 4. 사용량 대시보드 `/admin/usage`

- Cloudflare GraphQL 분석 API(`https://api.cloudflare.com/client/v4/graphql`)로 오늘(UTC)·최근 7일·이번 달 사용량을 무료 한도와 비교해 막대로 보여 준다(80% 노랑, 100% 빨강): Workers 요청, Workers AI 뉴런(모델별), D1 읽기·쓰기 행, KV 읽기·쓰기(쓰기 강조), R2 A급·B급 조회와 저장 용량, Vectorize 조회·저장 차원
- 우리 카운터(KST): 챗 턴(경로별 — 로그에 있는 경로를 그대로 센다), 추정 뉴런과 차단기 상태, 월 토큰 대비 상한, 메일 오늘·이번 달 대비 Resend 한도, 레터, 로그인, 긴급 스위치 상태
- 결과는 isolate마다 5분 캐시. "새로고침"은 캐시를 건너뛴다. KV에 쓰지 않는다
- 운영에는 **분석 읽기 전용 토큰**이 따로 필요하다(배포 토큰을 넣지 않는다). 없으면 Cloudflare 칸에 "Cloudflare 통계 토큰 없음"을 띄우고 우리 카운터만 보여 준다

## 5. 운영자가 직접 할 설정 (대시보드)

1. **분석 토큰** — dash.cloudflare.com → 오른쪽 위 프로필 → My Profile → API Tokens → Create Token → Custom token → 권한 `Account` · `Account Analytics` · `Read` 하나만, Account Resources는 이 계정만 → 만들기. 그다음 로컬에서 `pnpm exec wrangler secret put CF_ANALYTICS_TOKEN`(토큰 붙여넣기), `pnpm exec wrangler secret put CF_ACCOUNT_ID`(계정 ID — 대시보드 Workers 개요 오른쪽에 있다)
2. **결제 알림** — Manage Account → Billing → Billing notifications(또는 Notifications → Add → "Usage Based Billing") → 금액 임계값(예: $1) 알림을 이메일로
3. **Workers 사용량 알림** — Notifications → Add → Workers → "Workers usage" 류 알림이 있으면 켠다
4. **WAF 속도 제한 규칙(무료 1개)** — 도메인을 연결한 뒤 가능: Security → WAF → Rate limiting rules → `URI Path starts with /api/` 에 IP당 10초 20회, 초과 시 Block 10초. workers.dev 주소에는 적용되지 않는다
5. **Bot Fight Mode** — 도메인 연결 뒤 Security → Bots → Bot Fight Mode 켜기
6. **R2** — R2 → 개요의 사용량을 월 1회 확인. 쓰지 않는 객체는 지운다

## 6. 규칙 (CLAUDE.md에도 요약)

- 새로 부르는 유료·한도 자원(Workers AI·메일·R2 쓰기 등)은 `budget.ts`의 일일 상한을 거친다
- KV 쓰기는 요청마다 하지 않는다. 사이트 전체 집계는 D1 로그에서 센다
- 상한에 닿으면 기능을 끄는 쪽(고정 문구·429·503)으로 실패한다. 재시도 루프를 두지 않는다
- 상한 값을 바꾸면 이 문서 표를 고친다
