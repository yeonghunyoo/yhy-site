# 개발자 개입 가이드

코드로 끝낼 수 없고 **사람이 직접 해야 하는 일**을 순서대로 정리했습니다.
계정 만들기, 비밀값 발급, 외부 콘솔 설정, 법률 문서, 실기기 테스트가 여기에 해당합니다.
위에서부터 하나씩 진행하고 체크하세요. 각 단계에 **확인 방법**이 있습니다.

> 터미널 명령 중 브라우저 로그인이 필요한 것(`wrangler login` 등)은 Claude Code 프롬프트에 `! 명령어` 형태로 입력하면 이 세션에서 바로 실행됩니다.

## 현재 상태 (2026-11-04)

| 영역 | 상태 |
|---|---|
| 로컬 개발 환경 | ✅ 동작 (이 PC 기준) |
| 운영 배포 (Cloudflare) | ✅ 5~9·11단계 완료 (R2, Neon 싱가포르, Hyperdrive, 비밀값, cron). 도메인(10단계) 전이라 `https://nuvo.<계정 서브도메인>.workers.dev`로 운영 중 |
| 소셜 로그인 (Google·Kakao) | ⬜ 12~13단계 필요. **운영에서는 이메일 로그인이 꺼져 있어서, 이 단계 전에는 아무도 로그인할 수 없습니다** |
| 법률 문서 | ⬜ 14단계 필요 (소셜 로그인 심사에도 필요) |
| 실기기 검증 | ⬜ 17단계 필요 |

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
pnpm db:up            # Postgres 17 컨테이너 (nuvo-db)
pnpm db:migrate       # 스키마 적용
```
- 확인: `docker ps`에 `nuvo-db`가 보이면 완료.

### 3. 로컬 비밀값
```sh
cp apps/web/.dev.vars.example apps/web/.dev.vars
```
- 기본값으로 바로 동작합니다. 소셜 로그인을 로컬에서 시험하려면 12~13단계의 값을 여기에 채웁니다.

### 4. 실행과 테스트
```sh
pnpm dev                                              # http://localhost:5173
pnpm smoke                                            # API 시나리오 (개발 서버 실행 중일 때)
pnpm test                                             # 단위 테스트
pnpm --filter @nuvo/web exec playwright install chromium   # 처음 한 번
pnpm e2e                                              # 브라우저 E2E
```
- 확인: smoke "모두 통과"(53개), test 12개 통과, e2e 5개 통과.

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
- 이름을 바꾸면 `apps/web/wrangler.jsonc`의 `bucket_name`도 같이 바꿉니다.
- 버킷은 **공개(Public access)로 열지 않습니다.** 사진은 서명 URL로만 나갑니다.

### 7. 운영 DB (Neon)
Neon CLI(`neonctl`)로 진행합니다. 로그인만 사람이 하고, 나머지는 명령으로 끝납니다.
```sh
npx -y neonctl@latest login                       # 브라우저가 열림 (계정이 없으면 여기서 가입)
npx -y neonctl@latest projects create --name nuvo --region-id aws-ap-southeast-1 --pg-version 17
#   조직이 있으면 --org-id org-... 를 붙입니다. 리전은 싱가포르 (한국·일본 리전 없음)

cd apps/web
# 접속 주소(비밀번호 포함)를 화면에 출력하지 않고 git 제외 파일로만 저장
(umask 077; npx -y neonctl@latest connection-string --project-id <프로젝트 id> | tr -d '\n' > .neon-url.local)
cd ../..
DATABASE_URL="$(cat apps/web/.neon-url.local)" pnpm db:migrate
```
- `connection-string`의 기본값은 **직접 연결**(`-pooler` 없음)입니다. Hyperdrive가 연결 풀을 대신 관리하므로 이게 맞습니다.
- 접속 주소는 채팅·커밋·이슈에 남기지 마세요. `.neon-url.local`은 `.gitignore`(`*.local`)로 제외됩니다.
- [ ] Neon 콘솔 → Settings에서 **시점 복구(History retention) 보존 기간**을 확인합니다. 무료 플랜은 짧습니다.
- 확인: Neon 콘솔 → Tables에 `assets`, `blobs`, `user` 등 12개 테이블이 보이면 완료.

### 8. Hyperdrive (Worker ↔ DB 연결 풀)
```sh
cd apps/web
pnpm exec wrangler hyperdrive create nuvo-db --connection-string="$(cat .neon-url.local)"
```
- 출력된 `id`를 `apps/web/wrangler.jsonc`의 `hyperdrive[0].id`에 넣습니다. 이 id는 비밀값이 아닙니다 (이 Cloudflare 계정의 Worker만 쓸 수 있음). 저장소를 포크해서 쓰는 경우에는 자기 계정에서 만든 id로 바꿉니다.

### 9. 운영 비밀값
**권장 방법: 비밀값 파일로 첫 배포 때 함께 등록**
```sh
cd apps/web
cp .prod-secrets.example .prod-secrets.local && chmod 600 .prod-secrets.local
# 무작위 값 채우기
sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 48 | tr -d '\n')|; s|^MEDIA_SIGNING_KEY=.*|MEDIA_SIGNING_KEY=$(openssl rand -base64 48 | tr -d '\n')|" .prod-secrets.local
# BETTER_AUTH_URL 은 서비스 주소로 직접 수정 (도메인 전에는 https://nuvo.<서브도메인>.workers.dev)
pnpm build && pnpm exec wrangler deploy --secrets-file .prod-secrets.local
```
- `.prod-secrets.local`은 git에서 제외됩니다 (`*.local`). **비밀번호 관리자에도 백업**해 두세요.
- 한 번 등록한 비밀값은 이후 `pnpm deploy`에서도 유지됩니다.
- `MEDIA_SIGNING_KEY`를 잃어버리면 새로 만들면 됩니다. 사진은 안전하고, 기존 사진 URL만 바뀝니다.
- 도메인을 연결하면 `BETTER_AUTH_URL`을 새 주소로 바꾸고 다시 등록합니다.
- 확인: `pnpm exec wrangler secret list`에 세 이름이 `secret_text`로 보이면 완료.

하나씩 직접 넣을 때의 방법 (로컬 값을 재사용하지 마세요):
```sh
cd apps/web
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
openssl rand -base64 32 | pnpm exec wrangler secret put MEDIA_SIGNING_KEY
pnpm exec wrangler secret put BETTER_AUTH_URL      # 예: https://nuvo.example.com (10단계 도메인)
```
- `MEDIA_SIGNING_KEY`를 바꾸면 기존 사진 URL이 모두 무효가 됩니다. 사진 자체는 안전하고, 새로고침하면 새 URL을 받습니다.

### 10. 도메인 연결
- [ ] **결정 필요:** 서비스 도메인 (예: `nuvo.app`, 구매 가능 여부 확인)
- [ ] 도메인을 Cloudflare에 추가한 뒤 `apps/web/wrangler.jsonc`에 추가:
  ```jsonc
  "routes": [{ "pattern": "nuvo.example.com", "custom_domain": true }]
  ```
- 커스텀 도메인이 필요한 이유: `workers.dev` 주소에서는 Cloudflare 캐시(Cache API)가 동작하지 않아서, 사진을 매번 R2에서 읽게 됩니다.

### 11. 배포
```sh
pnpm deploy
```
- 확인: `https://도메인/api/health`가 `{"ok":true}`를 주면 완료.
- 확인: 로그인 후 `/api/health/db`가 시간을 돌려주면 DB 연결도 완료.
- 확인: Cloudflare 대시보드 → Workers → nuvo → Settings → Triggers에 **Cron `*/15 * * * *`**가 보이면 완료.
  - 완료하지 않은 업로드와 지운 사진의 R2 파일을 정리하는 작업입니다. `wrangler.jsonc`에 있어서 배포하면 자동으로 등록됩니다.
  - 로컬에서는 `curl http://localhost:5173/cdn-cgi/handler/scheduled`로 한 번 실행해 볼 수 있습니다.

---

## C. 로그인 연동

> 운영(`ENVIRONMENT=production`)에서는 이메일/비밀번호 로그인이 꺼져 있습니다. 아래 둘 중 최소 하나가 있어야 로그인할 수 있습니다.

### 12. Google 로그인
- [ ] [Google Cloud Console](https://console.cloud.google.com) → 프로젝트 생성
- [ ] **OAuth 동의 화면**: 외부(External), 앱 이름 `nuvo`, 지원 이메일, **개인정보처리방침 URL**(14단계)
  - 범위(scope)는 `openid`, `email`, `profile`만 씁니다. 민감한 범위가 아니라서 무거운 심사(CASA)는 필요 없습니다.
  - 게시 상태를 "프로덕션"으로 바꿉니다. 테스트 상태로 두면 등록한 테스트 사용자만 로그인됩니다.
- [ ] **사용자 인증 정보 → OAuth 클라이언트 ID**(웹 애플리케이션)
  - 승인된 리디렉션 URI:
    - `https://도메인/api/auth/callback/google`
    - `http://localhost:5173/api/auth/callback/google` (로컬 시험용)
- [ ] 값 넣기:
  ```sh
  cd apps/web
  pnpm exec wrangler secret put GOOGLE_CLIENT_ID
  pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
  ```
  로컬은 `.dev.vars`의 같은 이름에 넣습니다.
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
| `PERSONAL_QUOTA_GB` / `SPACE_QUOTA_GB` | `wrangler.jsonc` vars | — | 기본 5 / 20 |
| Hyperdrive `id` | `wrangler.jsonc` | 8단계 | |

## 결정이 필요한 것

- [ ] 서비스 도메인 (10단계)
- [ ] 무료 용량: 개인 5GB, Space 20GB (지금 값). 바꾸면 기존 라이브러리에도 반영할지
- [ ] 초대 링크 기본값: 7일, 최대 10명 (지금 값)
- [ ] 유료 플랜과 결제 (MVP 범위 밖, 다음 단계)
