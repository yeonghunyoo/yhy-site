# 개발자 개입 가이드

코드로 끝낼 수 없고 **사람이 직접 해야 하는 일**을 순서대로 정리했습니다.
계정 만들기, 비밀값 발급, 외부 콘솔 설정, 법률 문서, 실기기 테스트가 여기에 해당합니다.
위에서부터 하나씩 진행하고 체크하세요. 각 단계에 **확인 방법**이 있습니다.

> 터미널 명령 중 브라우저 로그인이 필요한 것(`wrangler login` 등)은 Claude Code 프롬프트에 `! 명령어` 형태로 입력하면 이 세션에서 바로 실행됩니다.

## 현재 상태 (2026-11-06)

| 영역 | 상태 |
|---|---|
| 코드 (1차 웹) | ✅ 큰 항목 끝남 — 개인 10GB·구독 상태(수동), 신고·차단·연락처, 계정 삭제 페이지, "앱에서 구독" 안내, noindex, 보안(위치·형식 검사·CSP·기기 로그아웃·초대 끊기). 남은 작은 코드는 [work-plan.md](work-plan.md) A |
| 테스트 | ✅ 11/05 로컬 Postgres로 단위 15·스모크 93·E2E 6·CSP 검사 통과 |
| 운영 배포 (Cloudflare) | ⚠️ 운영은 **11/04 코드**. 11/05 변경은 아직 배포 안 함 — 아래 "지금 할 일" 3번. portfolio-web과 **같은 계정**(임시), `https://nuvo.<계정 서브도메인>.workers.dev` |
| 로그인 | ⬜ 코드는 완료. 운영에서 쓰려면 도메인(10)+Resend(10-1) 또는 Google(12) |
| 법률 문서 | ⬜ 14단계 (스토어·소셜 로그인 심사와 유료 운영에 필요) |
| 실기기 검증 | ⬜ 17단계 |

## 지금 할 일 (2026-11-06, 순서대로)

코드가 기다리고 있는 사람 작업입니다. 위에서부터 하면 막히는 곳이 없습니다. 상세는 각 단계 번호로.

| # | 할 일 | 왜 지금 | 어디 |
|---|---|---|---|
| 1 | **도메인 정하고 사기** | 지원 메일(`SUPPORT_EMAIL`), 인증 메일(Resend), Google 로그인 주소, 스토어에 넣을 계정 삭제 주소(`/account/delete`), 엣지 캐시가 모두 도메인에 걸려 있음 | 10단계 |
| 2 | **nuvo 전용 Cloudflare 계정** 만들고 R2·Hyperdrive·비밀값 다시 만들기 | 유료 운영의 전제. 지금은 portfolio-web과 무료 한도(R2 10GB)를 나눠 써서 8GB 상한을 걸어 둠 | 5~9단계 (새 계정에서 다시). 운영 R2에 지킬 사진이 있으면 옮기기 먼저(아래 "계정 이전 메모") |
| 3 | **11/05 코드 운영 반영** | 운영 DB에 표 3개(구독·신고/차단·삭제 요청)가 없으면 새 코드가 동작하지 않음 | 아래 "11/05 코드 배포 순서" |
| 4 | **nuvo 전용 Resend 계정** + 도메인 인증 | 이메일 가입·인증 메일, 신고·삭제 요청 메일 | 10-1단계 |
| 5 | **Google 로그인** 설정 | 이메일 없이도 로그인되게. 리디렉션 URI가 도메인 기준 | 12단계 |
| 6 | **약관·개인정보처리방침 문구** | 유료 운영·스토어·소셜 로그인 심사 모두 필요. 문구가 오면 `/terms`·`/privacy`·동의 기록은 코드로 바로 | 14단계, [work-plan.md](work-plan.md) B ④ |
| 7 | **정할 것 4가지** — 구독 가격, 해지 후 사진 보관 기간, Space 원본 EXIF 위치(지금 안내만), 초대 기본값(7일·10명) | 가격·보관 기간은 약관 문구에 들어감 | [work-plan.md](work-plan.md) D, [pricing.md](pricing.md) |
| 8 | **Apple Developer Program 가입** ($99/연) | Sign in with Apple(iOS 앱 필수)과 iOS 앱 출시에 필요. 한국 개발자는 서버 간 알림 엔드포인트 등록 필수 | [work-plan.md](work-plan.md) B ⑥ |
| 9 | 비용 알림·요청 수 제한 | 새 계정에서 R2 사용량·요청 수 알림, WAF 제한 | 15·16단계 |
| 10 | 실기기 검증 | iPhone·Android 업로드, 대용량 폴더, HEIC 속도 | 17단계 |

나중에(2차 모바일 전): Google Play Console 등록($25), 사업자등록·통신판매업 신고 여부 확인([service-plan.md](service-plan.md) "출시 전 할 일").

### 11/05 코드 배포 순서

배포는 이 PC(로컬)에서 합니다. 클라우드 세션에는 Cloudflare 로그인이 없습니다.

1. [ ] 운영 DB에 마이그레이션 적용 (**배포보다 먼저**): `DATABASE_URL="$(cat apps/nuvo/.neon-url.local)" pnpm nuvo-db migrate` — 0004 구독·용량, 0005 신고·차단, 0006 삭제 요청, 0007 피드 "용량 가득" 알림. 0004는 기존 개인 사진함 한도를 10GB로, Space 한도를 0(소유자 몫)으로 바꿉니다
   - 접속 주소 파일 이름은 7단계에서 저장한 것을 씁니다
2. [ ] 배포: 루트에서 `pnpm nuvo deploy` (`pnpm deploy`는 pnpm 내장 명령이라 쓰지 않습니다)
3. [ ] **운영자 계정 구독 켜기** — 배포하면 모든 계정이 "구독 없음"이라 내 사진함 업로드·Space 만들기가 막힙니다. 아래 "수동 구독" SQL로 본인(과 먼저 써 볼 가족 대표) 계정을 켭니다. 초대받은 가족은 구독 없이 그 Space를 보고 올릴 수 있습니다
4. [ ] 헤더 확인:
   ```sh
   curl -sI https://도메인/library | grep -iE "x-robots-tag|content-security-policy"   # noindex와 CSP가 보여야 함
   curl -sI https://도메인/ | grep -i x-robots-tag                                     # 아무것도 안 나와야 함 (랜딩만 노출)
   curl -sI https://도메인/api/health | grep -i x-robots-tag                           # noindex
   ```
5. [ ] 브라우저에서 HEIC 사진 하나 열어 보기 (CSP 아래에서 WASM 디코딩 확인, D-021)
6. [ ] 도메인이 생기면 `wrangler.jsonc`의 `SUPPORT_EMAIL`을 채우고 다시 배포 — 그 전에는 화면에 연락처가 안 보이고 신고 메일도 가지 않습니다(신고 자체는 DB에 쌓임)

### 계정 이전 메모 (2번)

- **Neon(DB)은 Cloudflare 밖**이라 그대로 둡니다. 새 계정에서 Hyperdrive만 같은 접속 주소로 다시 만듭니다(8단계)
- **R2 사진**은 계정 사이에 자동으로 옮겨지지 않습니다. 운영에 지킬 사진이 없으면(테스트뿐이면) 새 버킷에서 새로 시작하고, 있으면 두 계정의 R2 API 토큰으로 `rclone copy`를 먼저 합니다 — 이때 키 이름(`o/{sha256}`, `t/{sha256}/{512|2048}`)을 그대로 둬야 DB와 맞습니다
- 옮긴 뒤 코드 후속(Claude가 할 일): `STORAGE_CAP_GB` 제거, `mvp.md`·site `cost-guard.md`의 "계정 공용 한도" 표 삭제, 루트 `docs/monorepo.md` 계정 표 갱신
- `MEDIA_SIGNING_KEY`·`BETTER_AUTH_SECRET`은 **같은 값을 옮겨 넣습니다**. 바꾸면 모두 로그아웃되고 이미 발급한 사진 링크가 무효가 됩니다

---

## A. 로컬 개발 (다른 PC에서 시작할 때)

### 1. 도구 설치
- Node.js 24 이상, pnpm, Docker(macOS는 colima 권장)
- ```sh
  pnpm install
  ```
- 확인: 에러 없이 끝나면 완료. (esbuild·workerd 빌드 스크립트 허용은 `pnpm-workspace.yaml`에 이미 들어 있음)

### 2. 로컬 DB
```sh
colima start          # Docker 데몬이 꺼져 있을 때
pnpm nuvo-db:up          # Postgres 17 컨테이너 (nuvo-db)
pnpm nuvo-db migrate  # 스키마 적용
```
- 확인: `docker ps`에 `nuvo-db`가 보이면 완료.

### 3. 로컬 비밀값
```sh
cp apps/nuvo/.dev.vars.example apps/nuvo/.dev.vars
```
- 기본값으로 바로 동작합니다. 소셜 로그인을 로컬에서 시험하려면 12~13단계의 값을 여기에 채웁니다.

### 4. 실행과 테스트
```sh
pnpm nuvo dev                                          # http://localhost:5173
pnpm nuvo:smoke                                          # API 시나리오 (개발 서버 실행 중일 때)
pnpm nuvo test                                          # 단위 테스트
pnpm --filter @nuvo/web exec playwright install chromium   # 처음 한 번
pnpm nuvo e2e                                          # 브라우저 E2E
```
- 확인: smoke "모두 통과"(58개), test 12개 통과, e2e 6개 통과.

---

## B. 첫 배포 (Cloudflare)

### 5. Cloudflare 계정과 로그인
- [ ] Cloudflare 계정 생성, **결제 수단 등록** (R2를 쓰려면 필요. 무료 사용량 안에서는 과금되지 않음)
- [ ] 터미널에서 로그인:
  ```sh
  pnpm --filter @nuvo/web exec wrangler login
  ```
- 확인: `pnpm --filter @nuvo/web exec wrangler whoami`에 계정이 보이면 완료.

### 6. R2 버킷 만들기
```sh
pnpm --filter @nuvo/web exec wrangler r2 bucket create nuvo-media
```
- 이름을 바꾸면 `apps/nuvo/wrangler.jsonc`의 `bucket_name`도 같이 바꿉니다.
- 버킷은 **공개(Public access)로 열지 않습니다.** 사진은 서명 URL로만 나갑니다.

### 7. 운영 DB (Neon)
Neon CLI(`neonctl`)로 진행합니다. 로그인만 사람이 하고, 나머지는 명령으로 끝납니다.
```sh
npx -y neonctl@latest login                       # 브라우저가 열림 (계정이 없으면 여기서 가입)
npx -y neonctl@latest projects create --name nuvo --region-id aws-ap-southeast-1 --pg-version 17
#   조직이 있으면 --org-id org-... 를 붙입니다. 리전은 싱가포르 (한국·일본 리전 없음)

cd apps/nuvo
# 접속 주소(비밀번호 포함)를 화면에 출력하지 않고 git 제외 파일로만 저장
(umask 077; npx -y neonctl@latest connection-string --project-id <프로젝트 id> | tr -d '\n' > .neon-url.local)
cd ../..
DATABASE_URL="$(cat apps/nuvo/.neon-url.local)" pnpm nuvo-db migrate
```
- `connection-string`의 기본값은 **직접 연결**(`-pooler` 없음)입니다. Hyperdrive가 연결 풀을 대신 관리하므로 이게 맞습니다.
- 접속 주소는 채팅·커밋·이슈에 남기지 마세요. `.neon-url.local`은 `.gitignore`(`*.local`)로 제외됩니다.
- [ ] Neon 콘솔 → Settings에서 **시점 복구(History retention) 보존 기간**을 확인합니다. 무료 플랜은 짧습니다.
- 확인: Neon 콘솔 → Tables에 `assets`, `blobs`, `user` 등 12개 테이블이 보이면 완료.

### 8. Hyperdrive (Worker ↔ DB 연결 풀)
```sh
cd apps/nuvo
pnpm exec wrangler hyperdrive create nuvo-db --connection-string="$(cat .neon-url.local)" --caching-disabled
```
- **`--caching-disabled`는 꼭 넣습니다.** Hyperdrive는 기본으로 읽기 결과를 60초 캐시합니다. 켜 두면 내보낸 멤버의 권한 확인이나 삭제 직후 타임라인이 최대 1분 늦게 반영됩니다.
  이미 만들었다면: `pnpm exec wrangler hyperdrive update <id> --caching-disabled`
- 출력된 `id`를 `apps/nuvo/wrangler.jsonc`의 `hyperdrive[0].id`에 넣습니다. 이 id는 비밀값이 아닙니다 (이 Cloudflare 계정의 Worker만 쓸 수 있음). 저장소를 포크해서 쓰는 경우에는 자기 계정에서 만든 id로 바꿉니다.

### 9. 운영 비밀값
**권장 방법: 비밀값 파일로 첫 배포 때 함께 등록**
```sh
cd apps/nuvo
cp .prod-secrets.example .prod-secrets.local && chmod 600 .prod-secrets.local
# 무작위 값 채우기
sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')|; s|^MEDIA_SIGNING_KEY=.*|MEDIA_SIGNING_KEY=$(openssl rand -base64 48 | tr -d '\n')|" .prod-secrets.local
# BETTER_AUTH_URL 은 서비스 주소로 직접 수정 (도메인 전에는 https://nuvo.<서브도메인>.workers.dev)
pnpm build && pnpm exec wrangler deploy --secrets-file .prod-secrets.local
```
- `.prod-secrets.local`은 git에서 제외됩니다 (`*.local`). **비밀번호 관리자에도 백업**해 두세요.
- 한 번 등록한 비밀값은 이후 `pnpm nuvo deploy`에서도 유지됩니다.
- `MEDIA_SIGNING_KEY`를 잃어버리면 새로 만들면 됩니다. 사진은 안전하고, 기존 사진 URL만 바뀝니다.
- 도메인을 연결하면 `BETTER_AUTH_URL`을 새 주소로 바꾸고 다시 등록합니다.
- 확인: `pnpm exec wrangler secret list`에 세 이름이 `secret_text`로 보이면 완료.

하나씩 직접 넣을 때의 방법 (로컬 값을 재사용하지 마세요):
```sh
cd apps/nuvo
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
openssl rand -base64 32 | pnpm exec wrangler secret put MEDIA_SIGNING_KEY
pnpm exec wrangler secret put BETTER_AUTH_URL      # 예: https://nuvo.example.com (10단계 도메인)
```
- `MEDIA_SIGNING_KEY`를 바꾸면 기존 사진 URL이 모두 무효가 됩니다. 사진 자체는 안전하고, 새로고침하면 새 URL을 받습니다.

### 10. 도메인 연결
- [ ] **결정 필요:** 서비스 도메인 (예: `nuvo.app`, 구매 가능 여부 확인)
- [ ] 도메인을 Cloudflare에 추가한 뒤 `apps/nuvo/wrangler.jsonc`에 추가:
  ```jsonc
  "routes": [{ "pattern": "nuvo.example.com", "custom_domain": true }]
  ```
- 커스텀 도메인이 필요한 이유: `workers.dev` 주소에서는 Cloudflare 캐시(Cache API)가 동작하지 않아서, 사진을 매번 R2에서 읽게 됩니다. 이메일 인증 메일을 보내는 데도 도메인이 필요합니다 (10-1단계).
- 구매: Cloudflare 대시보드 → Domain Registration → Register Domains (원가 판매, `.com` 연 $10 안팎). 대시보드에서만 살 수 있습니다.
- 도메인을 연결한 뒤 할 일:
  - [ ] `.prod-secrets.local`의 `BETTER_AUTH_URL`을 `https://도메인`으로 바꾸고 다시 배포 (`--secrets-file`)
  - [ ] Google OAuth 리디렉션 URI에 새 주소 추가 (12단계)

### 10-1. 메일 발송 (Resend) — 이메일 로그인에 필요
운영에서는 **Resend 키가 있어야 이메일 가입·로그인이 켜집니다.** 없으면 화면에 이메일 입력란이 나오지 않습니다.
1. [ ] [resend.com](https://resend.com)에 **nuvo 전용 계정**을 만듭니다 (무료: 월 3,000통, 하루 100통). portfolio-web의 Resend 계정을 같이 쓰면 두 앱 상한 합계가 무료 한도를 넘습니다 (루트 `docs/monorepo.md` "Cloudflare·Resend 계정")
2. [ ] Domains → **Add Domain**: 메일 전용 하위 도메인을 권장합니다 (예: `mail.도메인`). 리전은 Tokyo(ap-northeast-1)
3. [ ] 화면에 나온 DNS 레코드(DKIM·SPF·MX)를 넣습니다. 도메인이 Cloudflare에 있으면 Resend의 **Auto configure(Cloudflare)** 버튼으로 자동 등록됩니다.
   - 상태가 **Verified**가 될 때까지 기다립니다 (보통 몇 분).
4. [ ] API Keys → **Create API Key**: 권한 `Sending access`, 도메인은 2번 도메인만
5. [ ] 키를 화면·채팅에 남기지 않고 파일에 넣습니다 (클립보드에 복사한 뒤 프롬프트에 입력):
   ```
   ! sh apps/nuvo/scripts/set-secret.sh RESEND_API_KEY
   ```
   보내는 주소도 같은 방법으로 넣습니다 (`nuvo <noreply@mail.도메인>`을 복사한 뒤): `! sh apps/nuvo/scripts/set-secret.sh EMAIL_FROM`
6. [ ] `cd apps/nuvo && pnpm build && pnpm exec wrangler deploy --secrets-file .prod-secrets.local`
- 확인: `/api/auth-config`가 `"password":true`를 주고, 가입하면 인증 메일이 도착하면 완료.
- 같은 Resend 계정과 도메인을 다른 서비스(예: portfolio-web)와 함께 써도 됩니다. 보내는 주소(`EMAIL_FROM`)와 API 키만 서비스마다 따로 둡니다.

### 11. 배포
```sh
pnpm nuvo deploy   # 루트에서. pnpm deploy는 pnpm 내장 명령이라 쓰지 않는다
```
- 확인: `https://도메인/api/health`가 `{"ok":true}`를 주면 완료.
- 확인: 로그인 후 `/api/health/db`가 시간을 돌려주면 DB 연결도 완료.
- 확인: Cloudflare 대시보드 → Workers → nuvo → Settings → Triggers에 **Cron `*/15 * * * *`**가 보이면 완료.
  - 완료하지 않은 업로드와 지운 사진의 R2 파일을 정리하는 작업입니다. `wrangler.jsonc`에 있어서 배포하면 자동으로 등록됩니다.
  - 로컬에서는 `curl http://localhost:5173/cdn-cgi/handler/scheduled`로 한 번 실행해 볼 수 있습니다.

---

## C. 로그인 연동

> 운영 로그인 방법: **이메일**(10-1단계, 인증 메일 필수), **Google**(12단계), **카카오**(13단계, 나중에). 하나라도 설정되면 로그인할 수 있습니다.
> 보안 설정 (코드에 들어 있음): 이메일 인증 전 로그인 불가, 비밀번호 8~128자, 비밀번호 재설정 시 모든 기기 로그아웃,
> 로그인 5회/분·가입·메일 발송 3회/10분 제한(IP 기준, DB 저장), 세션 쿠키 캐시 끔(로그아웃 즉시 반영).

### 12. Google 로그인
- [ ] [Google Cloud Console](https://console.cloud.google.com) → **nuvo 전용 프로젝트** 생성
  - 동의 화면(앱 이름·로고)은 프로젝트마다 하나라서, 다른 서비스(예: portfolio-web)와 프로젝트를 같이 쓰면 로그인 창에 다른 이름이 보입니다.
- [ ] **Google Auth Platform → 브랜딩(OAuth 동의 화면)**: 대상 외부(External), 앱 이름 `nuvo`, 지원 이메일, **개인정보처리방침 URL**(14단계)
  - 범위(scope)는 `openid`, `email`, `profile`만 씁니다. 민감한 범위가 아니라서 무거운 심사(CASA)는 필요 없습니다.
  - 게시 상태를 "프로덕션"으로 바꿉니다. 테스트 상태로 두면 등록한 테스트 사용자만 로그인됩니다.
- [ ] **사용자 인증 정보 → OAuth 클라이언트 ID**(웹 애플리케이션)
  - 승인된 자바스크립트 원본: 비워 둡니다 (서버에서 처리)
  - 승인된 리디렉션 URI:
    - `https://nuvo.<서브도메인>.workers.dev/api/auth/callback/google` (지금 운영 주소)
    - `https://도메인/api/auth/callback/google` (도메인 연결 후 추가)
    - `http://localhost:5173/api/auth/callback/google` (로컬 시험용)
- [ ] 클라이언트 ID와 보안 비밀번호를 파일에 넣습니다. 화면·채팅에 남기지 않도록 하나씩 복사해서 프롬프트에 입력:
  ```
  ! sh apps/nuvo/scripts/set-secret.sh GOOGLE_CLIENT_ID
  ! sh apps/nuvo/scripts/set-secret.sh GOOGLE_CLIENT_SECRET
  ```
  로컬에서도 시험하려면 `apps/nuvo/.dev.vars`의 같은 이름에 넣습니다.
- [ ] `cd apps/nuvo && pnpm build && pnpm exec wrangler deploy --secrets-file .prod-secrets.local`
- 확인: 로그인 화면에 "Google로 계속하기" 버튼이 보이고, 로그인이 되면 완료.

### 13. 카카오 로그인
- [ ] [Kakao Developers](https://developers.kakao.com) → 애플리케이션 추가
- [ ] **플랫폼 → Web**: 사이트 도메인 등록 (`https://도메인`, `http://localhost:5173`)
- [ ] **카카오 로그인** 활성화, Redirect URI:
  - `https://도메인/api/auth/callback/kakao`
  - `http://localhost:5173/api/auth/callback/kakao`
- [ ] **동의항목**: 닉네임, 프로필 사진, **카카오계정(이메일)**
  - ⚠️ nuvo 계정은 이메일이 필수입니다. 이메일 동의를 받지 못하면 카카오 로그인이 실패합니다.
  - 이메일을 필수 동의로 받으려면 **비즈 앱 전환**(사업자 정보 등록)이 필요할 수 있습니다. 콘솔에서 확인하세요.
- [ ] **보안 → Client Secret** 생성 후 "사용함"
- [ ] 값 넣기: REST API 키는 `KAKAO_CLIENT_ID`, Client Secret은 `KAKAO_CLIENT_SECRET` (12단계와 같은 방법)
- 확인: "카카오로 계속하기" 버튼으로 로그인이 되고, 설정 화면에 이메일이 보이면 완료.

### 14. 개인정보처리방침·이용약관 (법률 검토 필요)
Google 동의 화면과 카카오 비즈 앱 전환에 URL이 필요하고, 개인정보보호법상 공개 의무가 있습니다.
**내용은 사람이(가능하면 전문가 검토로) 정해야 합니다.** 화면 페이지는 문구가 정해지면 바로 만들 수 있습니다.
- [ ] 수집 항목: 이름, 이메일, 프로필 사진, 업로드한 사진과 사진 속 메타데이터(촬영 시각, **위치**, 카메라)
- [ ] 처리 위탁·**국외 이전**: Cloudflare(저장·전송), Neon(DB). 이전되는 국가와 항목을 적습니다.
- [ ] 보관 기간과 파기: 계정 삭제 시 개인 라이브러리 즉시 삭제
  - 구현됨: 설정 → 계정 삭제
  - **Space에 올린 사진은 Space에 남는 정책**을 반드시 고지합니다.
- [ ] 아동 사진이 많은 서비스라는 점을 고려한 공유 범위 안내
- [ ] (나중) 얼굴 인식을 도입하면 생체정보라서 별도 동의가 필요합니다.

---

## D. 출시 전 점검

### 15. 비용 알림
- [ ] Cloudflare: Billing → 알림 설정 (R2 저장량, Workers 요청 수)
- [ ] Neon: 플랜 한도와 자동 일시정지 설정 확인

### 16. 요청 수 제한 (남용 방지)
코드에는 요청 수 제한이 없습니다. Cloudflare 대시보드 → Security → WAF → Rate limiting rules에 추가하세요.
- [ ] `/api/auth/*`: IP당 분당 20회 정도
- [ ] `/api/uploads/*`: IP당 분당 600회 정도 (사진 1장에 요청 4개)

### 17. 실기기 테스트 (사람이 직접)
자동 테스트는 데스크톱 Chromium에서만 돌았습니다. 아래는 실제 기기와 실제 사진으로 확인해야 합니다.
- [ ] **iPhone Safari**: 사진첩에서 여러 장 올리기
  - HEIC가 JPEG로 바뀌는지, 촬영 시각·위치가 유지되는지 확인
  - 바뀐다면 "파일" 앱에서 고르는 방법을 안내 문구에 추가합니다.
- [ ] **Android Chrome**: 업로드, 길게 눌러 선택, 사진 보기에서 스와이프
- [ ] **실제 사진 폴더(수만 장)** 연결 (Chrome/Edge 데스크톱)
  - 스캔 시간과 브라우저 저장소 사용량 확인
  - 10만 장 기준 썸네일 약 3GB 예상
- [ ] HEIC 원본이 많은 폴더: 처리 속도 (WASM 디코딩이라 JPEG보다 느림)
- [ ] 저사양 노트북·휴대폰: 랜딩 셰이더와 3D 보기가 버벅이지 않는지
- [ ] 두 사람이 각자 휴대폰으로 같은 Space에 올릴 때 실시간 알림이 오는지

### 18. (선택) CI/CD
- [ ] GitHub 저장소 연결 후 둘 중 하나:
  - Cloudflare Workers Builds (대시보드에서 저장소 연결)
  - GitHub Actions + 비밀값 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- 준비됨: `pnpm check`는 `.dev.vars` 없이도 통과합니다. 비밀값 타입을 `.dev.vars.example`에서 만들기 때문입니다.
  CI에서는 `pnpm install --frozen-lockfile && pnpm check && pnpm test && pnpm build`만 돌리면 됩니다 (DB 필요 없음).

---

## 비밀값·설정 목록

| 이름 | 어디에 | 언제 필요 | 비고 |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | `wrangler secret` / `.dev.vars` | 배포 | 세션 서명. 바꾸면 모두 로그아웃 |
| `BETTER_AUTH_URL` | `wrangler secret` / `.dev.vars` | 배포 | `https://도메인` |
| `MEDIA_SIGNING_KEY` | `wrangler secret` / `.dev.vars` | 배포 | 사진 URL 서명 |
| `GOOGLE_CLIENT_ID` / `_SECRET` | `wrangler secret` / `.dev.vars` | 12단계 | 비우면 버튼 숨김 |
| `KAKAO_CLIENT_ID` / `_SECRET` | `wrangler secret` / `.dev.vars` | 13단계 | 비우면 버튼 숨김 |
| `ENVIRONMENT` | `wrangler.jsonc` vars (`production`) / `.dev.vars` (`development`) | — | `development`일 때만 이메일 로그인 |
| `PERSONAL_QUOTA_GB` | `wrangler.jsonc` vars | — | 개인 구독 용량 10. Space는 별도 용량 없이 소유자 용량에서 차감([mvp.md](mvp.md) "용량·구독"). 바꿔도 이미 만든 사진함에는 반영되지 않음 |
| `STORAGE_CAP_GB` | `wrangler.jsonc` vars | — | 서비스 전체 저장 상한, 지금 8 — 계정을 옮기면 비용 알림으로 대체 ([service-plan.md](service-plan.md)) (R2 무료 10GB는 portfolio-web과 계정 공용, [mvp.md](mvp.md) "계정 공용 한도"). 0이면 상한 없음 |
| `APP_STORE_URL` / `PLAY_STORE_URL` | `wrangler.jsonc` vars | 앱 출시 때 | 웹의 "앱에서 구독" 안내 창에 나오는 스토어 링크. 비면 "앱 준비 중" |
| `ADMIN_TOKEN` | `wrangler secret` / `.dev.vars`(개발용 값) | 계정 삭제 요청이 생길 때 | 운영자 관리 경로(`/api/admin/*`) 열쇠. 32자 이상 무작위, 같은 값을 `.admin-token.local`에. 비우면 경로가 꺼짐 |
| `SUPPORT_EMAIL` | `wrangler.jsonc` vars | 도메인 결정 뒤, 스토어 출시 전 | 공개 지원 연락처. 랜딩·설정·신고 창에 표시되고 신고 메일이 이 주소로 감. 비면 숨김 |
| `MAIL_DAILY_CAP` / `MAIL_MONTHLY_CAP` | `wrangler.jsonc` vars | — | 서비스 전체 메일 상한 80 / 2,800 (Resend 무료 100 / 3,000 아래, [mvp.md](mvp.md) "메일 상한") |
| Hyperdrive `id` | `wrangler.jsonc` | 8단계 | |

## 수동 구독 (1차, 스토어 결제 전)

결제 연동 전에는 운영자가 DB에서 직접 구독을 켭니다. 켜진 계정만 내 사진함 업로드·Space 만들기가 됩니다(가족은 구독 없이 초대받은 Space 보기·올리기).

```sql
-- 켜기 (사용자 id는 user 표에서 이메일로 찾는다)
INSERT INTO subscriptions (user_id, source, status, note)
SELECT id, 'manual', 'active', '운영자 수동' FROM "user" WHERE email = 'someone@example.com';
-- 끄기
UPDATE subscriptions SET status = 'canceled', updated_at = now()
WHERE source = 'manual' AND user_id = (SELECT id FROM "user" WHERE email = 'someone@example.com');
```

로컬 개발 서버는 로그인한 계정으로 `POST /api/dev/subscribe`(끄기는 `?off`)를 부르면 됩니다. 운영에서는 404입니다.

## 계정 삭제 요청 (로그인할 수 없는 사람)

`/account/delete`에서 로그인할 수 없는 사람이 이메일로 삭제를 요청하면 `deletion_requests` 표에 쌓이고 `SUPPORT_EMAIL`로 메일이 옵니다. Google Play 요건이라 스토어 등록정보에 이 페이지 주소를 넣습니다.

1. [ ] 그 이메일로 본인 확인 메일을 보냅니다(답장을 받으면 본인). 요청은 아무나 넣을 수 있어서 **확인 없이 지우지 않습니다**
2. [ ] 운영자 토큰을 한 번만 준비합니다 — 32자 이상 무작위 값을 `wrangler secret`(`ADMIN_TOKEN`)과 git 제외 파일에 같이 둡니다:
   ```sh
   cd apps/nuvo
   (umask 077; openssl rand -base64 48 | tr -d '\n' > .admin-token.local)
   pnpm exec wrangler secret put ADMIN_TOKEN < .admin-token.local
   ```
   토큰이 없으면 관리 경로(`/api/admin/*`)는 꺼져 있습니다(404). 운영에서는 짧거나 `dev-only`로 시작하는 값을 거부합니다
3. [ ] 미리보기 → 삭제:
   ```sh
   ADMIN_TOKEN="$(cat apps/nuvo/.admin-token.local)" BASE_URL=https://도메인 node apps/nuvo/scripts/admin-delete-account.mjs someone@example.com
   # 지울 사진 수, 함께 지워질 Space, 소유권이 넘어갈 Space를 보여줌. 확인했으면:
   ... --yes             # 실제로 지움
   ... --yes --transfer  # 다른 멤버가 있는 Space의 소유자면 소유권을 넘기고 지움
   ```
   - 지우면 그 이메일의 열린 `deletion_requests`가 자동으로 "done"이 됩니다
   - 소유권은 가장 오래된 관리자 → 참여자 → 보기만 멤버 순서로 넘어갑니다. 본인 탈퇴와 같은 정리(사진·혼자인 Space·세션·실시간 연결·R2)를 합니다(`worker/lib/account.ts`)
4. [ ] 요청한 사람에게 처리했다고 답장합니다

## 결정이 필요한 것

- [ ] 서비스 도메인 (10단계)
- [x] ~~무료 용량: MVP는 무료 사용량 안에서 운영 (개인 2GB, Space 5GB, 전체 8GB)~~ — 11/04 무효. 목표는 실서비스 운영, 개인 10GB 선택 구독 ([service-plan.md](service-plan.md)). 지금 코드 값은 그대로
- [ ] 초대 링크 기본값: 7일, 최대 10명 (지금 값)
- [ ] 구독 가격·결제 수단·무료 용량·Space 용량 계산 — [service-plan.md](service-plan.md) "정할 것"
