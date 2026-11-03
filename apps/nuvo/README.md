# nuvo

흩어진 사진을 한곳에 모아 보고, 가족·친구와 함께 쌓아가는 프라이빗 사진 서비스.

- [docs/mvp.md](docs/mvp.md): 범위, 아키텍처, 보안 설계, 한계
- [docs/developer-guide.md](docs/developer-guide.md): **배포 전 사람이 해야 할 일 (순서대로)**
- [docs/design-system.md](docs/design-system.md): 색, 테마, 인터랙션 규칙

## 구조

```
apps/web/
  src/              React SPA (pages, components, lib/{local,media,upload}, three/, theme/)
  worker/           Cloudflare Worker: Hono API, 미디어 서빙, Durable Object(SpaceHub)
  e2e/              Playwright E2E
  scripts/smoke.mjs API 스모크 테스트
packages/shared/    zod 스키마, API 타입 (웹·향후 앱 공유)
packages/db/        Drizzle 스키마 + 마이그레이션 (Postgres)
```

## 개발

```sh
pnpm install
colima start && pnpm db:up && pnpm db:migrate     # 로컬 Postgres
cp apps/web/.dev.vars.example apps/web/.dev.vars
pnpm dev                                          # http://localhost:5173

pnpm typecheck
pnpm test        # 단위
pnpm smoke       # API (dev 서버 실행 중)
pnpm e2e         # 브라우저 (처음: pnpm --filter @nuvo/web exec playwright install chromium)
```

로컬에서는 이메일/비밀번호로 가입할 수 있습니다. 운영에서는 Google·카카오 로그인만 씁니다.

## 비밀값

저장소에는 비밀값이 없습니다. 모두 git에서 제외된 파일이나 Cloudflare Secrets에만 있습니다.

| 값 | 로컬 | 운영 |
|---|---|---|
| `BETTER_AUTH_SECRET`, `MEDIA_SIGNING_KEY`, OAuth 키 | `apps/web/.dev.vars` (템플릿: `.dev.vars.example`) | `wrangler secret` (템플릿: `apps/web/.prod-secrets.example`) |
| DB 접속 주소 | `wrangler.jsonc`의 `localConnectionString` (로컬 Docker 전용) | Hyperdrive 설정에 암호화 저장 |

`wrangler.jsonc`의 Hyperdrive `id`는 비밀값이 아닙니다 (해당 Cloudflare 계정의 Worker만 사용 가능). 포크해서 쓸 때는 자기 계정에서 만든 id로 바꾸세요.
