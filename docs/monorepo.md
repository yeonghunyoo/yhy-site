# 모노레포 설계 — portfolio-web + nuvo

작성 2026-11-04 · 작성자 yhy

## 목적과 범위

같은 사람이 만드는 Cloudflare Workers 앱 두 개(portfolio-web, nuvo)가 **서버 모듈(메일·예산 상한·요청 방어·알림)을 같이 쓰도록** 한 레포로 묶는다.

- **코드는 같이, 자원은 따로.** 레포는 하나지만 Cloudflare 계정·Resend 계정은 앱마다 따로 둔다. 무료 한도는 계정 단위라, 한 계정을 나눠 쓰면 한 앱의 폭주가 다른 앱을 멈춘다(11/04 결정)
- **forest-app은 넣지 않는다.** 비공개 레포이고 Claude Design 패키지와 handoff 작업 방식(레포 루트 기준)을 쓴다. 따로 둔다(11/04 결정)
- 이 레포(`yeonghunyoo/yhy-site`)를 그대로 키운다. `yeonghunyoo/nuvo`는 기록째 합친 뒤 보관(archive)한다

## 구조

```
yhy-site/
├─ apps/
│  ├─ site/            portfolio-web (Astro). 예전 레포 루트 그대로 — 설계 기준은 apps/site/docs/
│  └─ nuvo/            nuvo 웹 + Worker (Vite + Hono). 예전 nuvo/apps/web, 문서는 apps/nuvo/docs/
├─ packages/
│  ├─ cf-kit/          @yhy/cf-kit — 두 앱이 같이 쓰는 서버 모듈
│  ├─ nuvo-db/         @nuvo/db (Drizzle, Postgres)
│  └─ nuvo-shared/     @nuvo/shared (zod 스키마)
├─ docs/monorepo.md    이 문서 (레포 전체 규칙)
├─ CLAUDE.md           공통 규칙. 앱 규칙은 apps/*/CLAUDE.md
├─ tsconfig.base.json  nuvo 쪽 패키지가 extends
├─ pnpm-workspace.yaml apps/*, packages/*
└─ package.json        packageManager pnpm 12, engines node >=24
```

- 빌드 도구(Turbo·Nx)는 넣지 않는다. `pnpm --filter`와 `pnpm -r`로 충분하다
- 공용 패키지는 빌드하지 않고 TS 원본을 그대로 내보낸다(`exports` → `./src/*.ts`). 각 앱의 번들러가 함께 묶는다

## 버전

| 항목 | 정책 |
| --- | --- |
| Node | 24 (`.nvmrc` 루트) |
| pnpm | 12, lockfile 하나(루트) |
| TypeScript | **패키지마다 따로.** site는 6 고정(astro check가 7 미지원), nuvo는 7. 루트에는 두지 않는다 |
| cf-kit | TS 6으로 typecheck하고, nuvo가 원본을 TS 7로 다시 검사한다 — 두 버전 모두 통과해야 한다 |

## 스크립트 (루트)

| 명령 | 하는 일 |
| --- | --- |
| `pnpm build` | 모든 앱 빌드. **푸시 전 통과 필수** |
| `pnpm check` | site `astro check` + nuvo·패키지 `typecheck` |
| `pnpm test` | 단위 테스트(cf-kit, nuvo) |
| `pnpm site <스크립트>` / `pnpm nuvo <스크립트>` | 앱 스크립트를 루트에서. 예: `pnpm site dev`, `pnpm site db:migrate:remote`, `pnpm nuvo e2e` |
| `pnpm site deploy` / `pnpm nuvo deploy` | 앱별 운영 배포. 사용자가 요청할 때만 |
| `pnpm nuvo-db <스크립트>`, `pnpm nuvo-db:up`, `pnpm nuvo:smoke` | nuvo DB(Drizzle)·로컬 Postgres·API 스모크 |

루트에 `deploy`라는 이름은 두지 않는다(`pnpm deploy`는 pnpm 내장 명령). 앱 폴더 안에서는 지금처럼 `pnpm run deploy`.

## Cloudflare·Resend 계정

| 앱 | Cloudflare | Resend | 상태 |
| --- | --- | --- | --- |
| site | 지금 계정 | 지금 계정 | 그대로 |
| nuvo | **새 계정** | **새 계정** | 사용자가 계정을 만든 뒤 옮긴다 |

- 각 앱 `wrangler.jsonc`에 `account_id`를 적는다. 로그인 하나가 두 계정에 속하면 wrangler가 어느 계정인지 묻기 때문이다
- 계정을 나누기 전까지는 같은 계정이라 R2 10GB를 나눠 쓴다(site 1GB 안, nuvo 8GB — site `docs/guides/cost-guard.md` "계정 공용 한도"). 나누면 nuvo `STORAGE_CAP_GB`를 9로 되돌리고 그 표를 지운다
- 메일 도메인은 앱마다 다르게(또는 서브도메인으로) 잡는다. 도메인은 아직 미정
- 비밀값은 지금처럼 앱 폴더의 `.dev.vars`·`.prod.vars`(site), `.dev.vars`·`.prod-secrets.local`(nuvo). 루트 `.gitignore`가 모든 하위 폴더에서 막는다

## @yhy/cf-kit

두 앱이 이미 각자 갖고 있던 코드만 옮긴다. 새 기능을 여기서 먼저 만들지 않는다.

| 모듈 | 내용 | 쓰는 곳 |
| --- | --- | --- |
| `@yhy/cf-kit/mail` | Resend 발송 + 키가 없을 때의 로컬 처리 + 예산 상한 연결 | site, nuvo |
| `@yhy/cf-kit/budget` | `usageLevel`·`capFrom`·KST 날짜, 일·월 카운터 상한(`createCountBudget`), KV 카운터 어댑터 | site(KV), nuvo(Postgres 어댑터는 앱에) |
| `@yhy/cf-kit/guard` | `WindowLimiter`, `sameOrigin`, `botReason` 순수 함수 | site. nuvo 연결은 따로 결정(업로드 본문 크기·WebSocket과 부딪힌다) |
| `@yhy/cf-kit/notify` | Telegram 발송, `maskEmail` | site |

규칙:

1. `cloudflare:workers`를 import하지 않는다. `env`·바인딩·`waitUntil`은 앱이 인자로 넘긴다(site는 Astro, nuvo는 Hono라 접근 방식이 다르다)
2. 저장소는 인터페이스로 받는다(`CounterStore`). D1·KV·Postgres를 패키지가 모른다
3. 사이트 전용 규칙(경로별 메서드, 레터·챗 봇 검사 대상, 상한 기본값)은 앱에 둔다
4. 순수 함수는 cf-kit 안에서 단위 테스트한다(vitest)

## nuvo 메일 상한 (11/04)

nuvo는 운영에 `RESEND_API_KEY`를 넣으면 이메일 가입이 켜지는데, 서비스 전체 상한이 없었다. cf-kit `budget`으로 하루 80통·월 2,800통(site와 같은 기본값, Resend 계정을 나누는 전제)을 건다. 카운터는 Postgres `usage_counter` 표(upsert라 동시 요청에도 정확하다). 넘으면 인증·재설정 메일을 보내지 않고 429 `mail_budget`.

## 이전 절차 (11/04)

1. 이 문서 커밋
2. site 파일을 `apps/site/`로 `git mv` (이 문서와 `.claude/`는 루트에 남긴다)
3. nuvo `main`의 기록을 `git filter-branch --index-filter`로 최종 경로(`apps/nuvo`·`packages/nuvo-*`)로 다시 쓴 뒤 `--allow-unrelated-histories`로 합친다. 루트 설정 파일만 바꾼 커밋은 빠진다(원본은 보관된 `yeonghunyoo/nuvo`에 남는다)
4. 루트 설정(`package.json`·`pnpm-workspace.yaml`·`.gitignore`·`.nvmrc`·`CLAUDE.md`), 경로 참조 갱신, `pnpm install`, `pnpm build`·`check`·`test`
5. cf-kit 추출: mail → budget → guard → notify
6. nuvo 메일 상한
7. (사용자) nuvo용 Cloudflare·Resend 계정 생성 → `account_id`, 리소스 다시 만들기, R2 상한 원복
8. `yeonghunyoo/nuvo` README에 새 위치를 적고 보관(archive)은 사용자가 한다

기록 확인: `git log --follow apps/site/src/middleware.ts`, `git log --follow apps/nuvo/worker/index.ts`.
