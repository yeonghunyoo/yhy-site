# 0단계 · 인프라 (Cloudflare)

배포 대상은 Cloudflare Worker 하나다. 정적 페이지는 Workers 정적 자산(Static Assets)으로 서빙하고, 동적 요청(`/auth` `/api` `/admin`)만 같은 Worker의 코드가 처리한다. Worker만 D1·KV·외부 서비스에 닿고, 비밀은 전부 Worker 시크릿에 있다. 구성도는 [overview.md](overview.md)에 있다.

> **2026-10-28 변경**: 처음 설계는 Cloudflare Pages + Pages Functions였다. Astro Cloudflare 어댑터(v13+)가 Pages 배포 지원을 중단해 Workers로 전환했다. D1·KV 사용 방식과 무료 운영 전제는 그대로다.

## 사용 서비스

| 서비스 | 용도 | 무료 한도(요지) | 단계 |
| --- | --- | --- | --- |
| Registrar | 도메인 구매, 원가 판매 | — | 0 |
| DNS + 프록시 | 도메인 연결, TLS, 캐시, 무료 WAF | 무제한 | 0 |
| Workers 정적 자산 | Astro 빌드 결과(HTML·JS·이미지) 호스팅 | 요청 무료·무제한 | 0 |
| Workers Builds | GitHub 연동 자동 빌드·배포, 비운영 브랜치 프리뷰 URL | 월 3,000 빌드 분, 동시 1개, 빌드당 20분 | 0 |
| Workers (동적) | `/auth` `/api` `/admin` | 일 10만 요청 | 2 |
| D1 | 유저·세션·레터·(2차)챗 로그 | 5GB, 일 500만 읽기 | 2 |
| KV | 레이트리밋 카운터 | 일 10만 읽기, 1천 쓰기 | 2 |
| Email Routing | `letters@{도메인}` 수신을 개인 메일로 포워딩 (선택) | 무료 | 3 |
| Web Analytics | 쿠키 없는 방문 통계 (선택) | 무료 | 1 |
| Vectorize | RAG 벡터 인덱스 | 월 3천만 쿼리 차원 | 6 |
| Workers AI | 임베딩 모델 | 일 1만 뉴런 | 6 |

## 레포 골격

| 파일 | 내용 |
| --- | --- |
| `package.json` | `packageManager: pnpm@12.15.0`, Node 24 이상. 스크립트 `dev` `build` `preview` `deploy` `cf-typegen` |
| `.nvmrc` | `24` — 로컬 nvm과 Workers Builds가 같이 읽는다 |
| `astro.config.mjs` | `output: 'static'`, `@astrojs/cloudflare` (`session: false`, `imageService: 'compile'`) |
| `wrangler.jsonc` | Worker 이름 `portfolio-web`, `compatibility_date`, `nodejs_compat`, observability. 바인딩은 2단계에서 추가 |
| `pnpm-workspace.yaml` | 설치 스크립트 허용 목록(`esbuild`, `workerd`) |
| `src/pages/index.astro` | 0단계 확인용 Hello 페이지 — 1단계에서 `/ko`·`/en` 구조로 교체 |

**어댑터 기본값을 바꾼 이유**

- `session: false` — 어댑터는 기본으로 Astro 세션용 KV(`SESSION`)를 배포 때 자동 생성한다. 세션은 Better Auth(D1)가 맡으므로 끈다.
- `imageService: 'compile'` — 기본값은 Cloudflare Images 바인딩으로 런타임 변환한다. 빌드 때 최적화하고 런타임은 그대로 서빙해 바인딩·과금 요소를 없앤다. 이미지를 처음 쓰는 1단계에서 빌드가 `sharp`를 요구하면 devDependency로 추가한다.
- `compatibility_date`는 설치된 workerd가 지원하는 날짜 이하여야 빌드가 된다. 오늘 날짜는 아직 지원되지 않을 수 있으니 며칠 앞 날짜로 둔다.

## 배포·로컬

**배포 흐름**: GitHub `main` 푸시 → Workers Builds가 `pnpm build` 후 `npx wrangler deploy` → 운영. 다른 브랜치(`phase/*`) 푸시는 프리뷰 URL을 만든다. D1 마이그레이션은 배포 전 `wrangler d1 migrations apply`로 수동 적용(MVP는 별도 CI 없이).

**로컬 개발**

- `pnpm dev` — Astro 개발 서버
- `pnpm preview` — 빌드 후 `wrangler dev`로 운영과 같은 Workers 런타임에서 확인(`http://localhost:8787`). D1·KV 로컬 에뮬레이션 포함
- 비밀은 `.dev.vars`
- `pnpm deploy` — 로컬에서 직접 배포(비상용, 평소엔 Workers Builds)

## 0단계 작업 순서

1. 브랜드/도메인 확정 → Registrar에서 구매
2. GitHub Public 레포 생성(pnpm), 푸시
3. 레포 골격(위 표) 작성, 로컬 `pnpm preview`로 Hello 확인
4. Cloudflare 대시보드 → Workers & Pages → Create → Import a repository로 Worker 생성
   - Worker 이름은 `wrangler.jsonc`의 `name`(`portfolio-web`)과 같아야 한다
   - 빌드 명령 `pnpm build`, 배포 명령 `npx wrangler deploy`, 운영 브랜치 `main`
   - `*.workers.dev` 주소에서 Hello 확인
5. 커스텀 도메인 연결(Worker → Settings → Domains & Routes), HTTPS 확인
6. Web Analytics 켜기(선택)

**완료 기준**: 도메인으로 접속 시 "Hello" 페이지가 모바일·데스크톱에서 열린다.

## 본인이 직접 할 일

- [ ] 도메인 구매(Cloudflare 계정 결제 수단 등록)
- [ ] GitHub 레포 생성 및 Workers Builds에 GitHub 앱 권한 부여
