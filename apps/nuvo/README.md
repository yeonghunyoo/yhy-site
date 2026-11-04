# nuvo

> 2026-11-04부터 모노레포 [`yeonghunyoo/yhy-site`](../../docs/monorepo.md)의 `apps/nuvo`. 아래 명령은 레포 루트에서 실행합니다.

흩어진 사진을 한곳에 모아 보고, 가족·친구와 함께 쌓아가는 프라이빗 사진 서비스.

- [docs/service-plan.md](docs/service-plan.md): **목표** — 실서비스 운영, 개인 10GB 선택 구독, PC·휴대폰 로컬 사진 보기, 모바일 네이티브 앱 (11/04 재조정)
- [docs/mvp.md](docs/mvp.md): 현재 구현 기록 — 범위, 아키텍처, 보안 설계, 검색 노출(기본 noindex), 한계
- [docs/developer-guide.md](docs/developer-guide.md): **배포 전 사람이 해야 할 일 (순서대로)**
- [docs/design-system.md](docs/design-system.md): 색, 테마, 인터랙션 규칙
- [docs/roadmap-video-classification.md](docs/roadmap-video-classification.md): 동영상·자동 분류 제안 (구현 전)

## 구조

```
apps/nuvo/
  src/              React SPA (pages, components, lib/{local,media,upload}, three/, theme/)
  worker/           Cloudflare Worker: Hono API, 미디어 서빙, Durable Object(SpaceHub)
  e2e/              Playwright E2E
  scripts/smoke.mjs API 스모크 테스트
packages/nuvo-shared/ zod 스키마, API 타입 (웹·향후 앱 공유)
packages/nuvo-db/     Drizzle 스키마 + 마이그레이션 (Postgres)
```

## 개발

```sh
pnpm install
colima start && pnpm nuvo-db:up && pnpm nuvo-db migrate   # 로컬 Postgres
cp apps/nuvo/.dev.vars.example apps/nuvo/.dev.vars
pnpm nuvo dev                                      # http://localhost:5173

pnpm check
pnpm nuvo test     # 단위
pnpm nuvo:smoke     # API (dev 서버 실행 중)
pnpm nuvo e2e     # 브라우저 (처음: pnpm --filter @nuvo/web exec playwright install chromium)
```

로컬에서는 이메일/비밀번호로 가입할 수 있습니다. 운영에서는 Google·카카오 로그인만 씁니다.

## 비밀값

저장소에는 비밀값이 없습니다. 모두 git에서 제외된 파일이나 Cloudflare Secrets에만 있습니다.

**새 비밀값을 추가할 때는 `apps/nuvo/.dev.vars.example`에도 이름을 넣으세요.** Worker의 `Env` 타입을 이 템플릿에서 만들기 때문에, 빠뜨리면 typecheck가 실패합니다.

| 값 | 로컬 | 운영 |
|---|---|---|
| `BETTER_AUTH_SECRET`, `MEDIA_SIGNING_KEY`, OAuth 키 | `apps/nuvo/.dev.vars` (템플릿: `.dev.vars.example`) | `wrangler secret` (템플릿: `apps/nuvo/.prod-secrets.example`) |
| DB 접속 주소 | `wrangler.jsonc`의 `localConnectionString` (로컬 Docker 전용) | Hyperdrive 설정에 암호화 저장 |

`wrangler.jsonc`의 Hyperdrive `id`는 비밀값이 아닙니다 (해당 Cloudflare 계정의 Worker만 사용 가능). 포크해서 쓸 때는 자기 계정에서 만든 id로 바꾸세요.
