# yhy-site 모노레포 — Claude Code 작업 지침

두 앱과 공용 패키지가 있다. 구조·계정·공용 모듈 규칙은 `docs/monorepo.md`가 기준이다.

| 경로 | 무엇 | 앱 지침 |
| --- | --- | --- |
| `apps/site/` | portfolio-web (Astro, Cloudflare Workers) | `apps/site/CLAUDE.md`, 설계 `apps/site/docs/` |
| `apps/nuvo/` | nuvo 사진 서비스 (Vite + Hono, Workers) | `apps/nuvo/README.md`, 설계 `apps/nuvo/docs/` |
| `packages/cf-kit/` | `@yhy/cf-kit` — 두 앱이 같이 쓰는 서버 모듈 | `docs/monorepo.md` "@yhy/cf-kit" |
| `packages/nuvo-db/`, `packages/nuvo-shared/` | nuvo 전용 패키지 | |

## 공통 규칙
- 1인 작업: PR 없이 `main`에 바로 커밋하고 푸시한다. 푸시 전 루트 `pnpm build`가 통과해야 한다. 바꾼 앱의 `pnpm check`·`pnpm test`도 돌린다
- 여러 세션이 동시에 `main`에 푸시한다(11/04). git 작업은 항상 최신화와 병합을 먼저 챙긴다:
  - 작업 시작 전: `git status -sb`로 `main` 브랜치인지 확인한다(detached HEAD면 커밋 전에 `main`으로 옮긴다). 그다음 `git pull --rebase origin main`
  - 푸시 직전: 다시 `git fetch origin main`, 앞서 간 커밋이 있으면 `git rebase origin/main`(병합 커밋이 이미 있으면 `git merge origin/main`). 충돌은 양쪽 의도를 살려 풀고, 다른 세션의 변경을 지우지 않는다. 받은 커밋이 있으면 `pnpm build`(바꾼 앱의 check·test)를 다시 돌린 뒤 푸시한다
  - 푸시가 non-fast-forward로 거부되면 위 과정을 반복한다. `--force`·`--force-with-lease`로 `main`을 덮어쓰지 않는다
  - 충돌이 내 작업 범위 밖이거나 어느 쪽이 맞는지 판단이 안 서면 멈추고 사용자에게 묻는다
- 설계와 코드가 어긋나면 코드를 임의로 바꾸지 말고 해당 앱의 `docs/`(레포 구조면 `docs/monorepo.md`)를 먼저 고치자고 제안한다
- 비밀값은 절대 커밋하지 않는다. 각 앱 폴더의 `.dev.vars` 등에 두고 템플릿(`.example`)만 커밋한다
- Cloudflare·Resend 계정은 앱마다 따로다. 한 앱의 바인딩·리소스 id를 다른 앱에 쓰지 않는다
- 배포는 앱별(`pnpm site deploy`, `pnpm nuvo deploy`)로, 사용자가 요청할 때만. 루트에 `deploy` 스크립트를 두지 않는다(`pnpm deploy`는 pnpm 내장 명령)
- 공용 모듈(`packages/cf-kit`)은 `cloudflare:workers`를 import하지 않고, env·저장소를 인자로 받는다. 바꾸면 두 앱을 모두 빌드·검사한다
- TypeScript는 패키지마다 따로: site 6 고정, nuvo 7. 루트에 typescript를 두지 않는다
- forest-app은 이 레포에 넣지 않는다(별도 비공개 레포)
