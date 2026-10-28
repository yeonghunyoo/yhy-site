# portfolio-web — Claude Code 작업 지침

설계도는 `docs/`에 있다. 작업 전에 `docs/overview.md`를 읽고, 해당 단계 문서(`docs/NN-*.md`)를 기준으로 구현한다.
설계와 코드가 어긋나면 코드를 임의로 바꾸지 말고 먼저 `docs/`를 갱신하자고 제안한다. 이 레포의 `docs/`가 설계의 기준이다.

## 한 줄 요약
빌더·개발자 포트폴리오. 한/영 정적 사이트 + 이메일/Google 로그인 + 레터 모달 + 간략 어드민이 MVP. 챗/RAG와 3D는 2차.

## 확정 스택
- 프론트: Astro 5+ (`output: 'static'` + 동적 경로만 `prerender = false`, `@astrojs/cloudflare`), React 아일랜드(로그인·레터·챗·3D만), Tailwind v4
- 인프라: Cloudflare 단일 — Workers(정적 자산 + 동적, Workers Builds로 배포), D1, KV, (2차) Vectorize·Workers AI. Pages는 쓰지 않는다
- 런타임: Node 24 (`.nvmrc`), pnpm 12 (`packageManager`). 로컬 확인은 `pnpm preview`(wrangler dev)
- 인증: Better Auth (D1 어댑터), 이메일 매직링크 + Google OAuth, 비밀번호 없음
- 메일: Resend / 알림: Telegram 봇
- 패키지 매니저: pnpm. 레포는 GitHub Public

## 규칙
- i18n: `/ko`, `/en` 경로 분리, 기본 ko. 문자열은 `src/i18n/*.json`, 긴 본문은 content collection의 `{slug}.ko.md` / `.en.md`
- 모바일 우선: 기본 스타일이 모바일, `md` 이상에서 확장. 터치 타깃 44px, `100dvh`, safe-area. 성능 예산은 `docs/01-frontend.md`
- 3D·챗은 지연 로드 아일랜드로 격리하고 저사양·reduced-motion 폴백을 둔다
- 디자인 토큰은 `src/styles/tokens.css`에만. 세계관/UI 라이브러리는 미정이므로 임의로 정하지 않는다
- 비밀값은 절대 커밋하지 않는다. 로컬은 `.dev.vars`, 운영은 Cloudflare 환경변수. 목록은 `docs/common.md`
- `/admin`과 `/api/admin/*`는 관리자 이메일 허용목록(`ADMIN_EMAILS`) 검증, 비관리자는 404
- 단계 문서의 "완료 기준"을 통과해야 다음 단계로 간다. 단계마다 브랜치 하나(`phase/NN-name`)

## 단계 순서
0 인프라 → 1 프론트+반응형 → 2 인증 → 3 레터 → 4 어드민(MVP 공개) → 5–6 챗+RAG → 7 3D

## 아직 미정 (임의 결정 금지)
브랜드/도메인, 세계관 콘셉트, 디자인 MCP·컴포넌트 라이브러리, 레터 수신 메일·관리자 이메일. 상세는 `docs/overview.md`의 "미결정 사항".
