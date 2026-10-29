# 1단계 · 프론트엔드 + 반응형 UX

정적 HTML이 기본이고, 로그인·레터 모달·챗·3D만 React 아일랜드로 띄운다. 어드민과 인증 콜백만 SSR이다. 모바일이 1차 타깃이다.

## Astro 구조

**렌더링 모드**: `output: 'static'` (Astro 5+, 구 `hybrid` 모드가 여기에 통합됨) — 기본 정적(prerender), `/admin/*`·`/api/*`·`/auth/*`만 페이지에 `export const prerender = false`. 어댑터는 `@astrojs/cloudflare`.

**i18n**: Astro 내장 i18n 라우팅은 쓰지 않는다(접두어 없는 `/admin`까지 404로 만든다). `src/pages/[locale]/`의 `getStaticPaths`로 `/ko`·`/en`을 만들고, 루트 `/`는 `src/pages/index.astro`(동적)가 `Accept-Language`로 `/ko` 또는 `/en`에 302로 보낸다. 문자열은 `src/i18n/ko.json`·`en.json`(+ `src/i18n/index.ts` 헬퍼), 긴 본문(프로젝트 설명)은 `src/content/projects/{slug}.ko.md`·`.en.md`로 Content Collections에 둔다(id는 파일명 그대로 `{slug}.{locale}`).

**섹션 (1차)**

1. 인트로 — 이름 + 한 줄. 나중에 3D 아일랜드가 배경으로 들어갈 자리. 챗 독(2차)도 이 화면 우하단에 접힌 상태로 위치
2. 프로젝트 — "이 포트폴리오" 상세: 문제 / 접근 / 결과 / 기술 스택 / 변경 이력(빌드 로그 형식, 최신순)
3. 연락 — 로그인 버튼 + 레터 보내기 (비로그인 시 로그인 유도)

**디렉터리 구조**

```
src/
  pages/index.astro                # 동적: Accept-Language → /ko·/en
  pages/404.astro                  # 동적(미들웨어 rewrite 대상)
  pages/[locale]/index.astro       # 인트로 + 프로젝트 + 연락
  pages/[locale]/projects/[slug].astro
  pages/[locale]/privacy.astro
  pages/admin/                     # SSR: 지표, letters/, letters/[id], users
  pages/api/                       # letters, account, admin/…(폼 POST)
  pages/auth/[...all].ts           # Better Auth 핸들러(basePath /auth)
  components/ui/                   # Astro 컴포넌트 (Header, Footer)
  components/admin/                # BarChart(SVG), StatusBadge
  components/islands/              # React: Overlay(시트·토스트), AuthMenu, Sheet, Login/Letter/AccountSheet
  directives/demand.ts             # client:demand 하이드레이션 디렉티브
  content/projects/                # ko/en 마크다운
  db/                              # Drizzle 스키마(auth-schema.ts는 Better Auth CLI 생성)
  i18n/                            # ko.json, en.json, index.ts
  lib/server/                      # auth, db, mail, templates, notify, ratelimit, errors, admin, dates
  lib/auth-client.ts, lib/letters.ts
  middleware.ts                    # 세션 주입, admin 가드(404), 5xx 알림
```

**아일랜드 로딩 전략**

| 아일랜드 | 지시어 | 이유 |
| --- | --- | --- |
| Overlay(로그인·레터·계정 삭제 시트), AuthMenu | `client:demand` (커스텀) | 비로그인 방문자는 React를 받지 않는다. 로그인 상태이거나 로그인 복귀 직후면 바로, 아니면 `[data-action]` 버튼을 처음 누를 때 하이드레이트하고 그 클릭을 이어서 처리 |
| ChatDock (2차) | `client:demand` 또는 `client:idle` | 접힌 독만 먼저, 패널은 열 때 동적 import |
| Hero3D (옵션) | `client:visible` + 저사양 감지 | 모바일·저사양은 정적 그라디언트 폴백 |

> `client:idle`로는 React DOM 때문에 초기 JS가 약 87KB(gzip)라 예산(50KB)을 넘었다. `client:demand`로 비로그인 첫 화면의 JS는 인라인 2.4KB다(10/29 측정).

**보안 헤더(CSP)**: Astro `security.csp`로 페이지마다 `<meta>` CSP를 넣고, Astro가 인라인 스크립트·스타일을 해시로 허용한다. 그래서 HTML의 `style=""` 속성은 쓰지 않는다(Tailwind 클래스로). React의 `style` prop은 DOM API라 괜찮다. Shiki 코드 하이라이트는 인라인 style을 써서 꺼 두었다.

**스타일**: Tailwind v4. 디자인 토큰은 `src/styles/tokens.css`의 CSS 변수로 두고, 세계관 콘셉트가 정해지면 이 파일만 교체한다. UI 레퍼런스는 Mobbin, 컴포넌트는 daisyUI 5(`@plugin "daisyui"`). 도입 시 `global.css`의 자체 `.btn`·`.btn-primary`·`.btn-ghost`는 daisyUI 클래스와 이름이 겹치므로 daisyUI 것으로 옮기고, 색은 `tokens.css` 값을 daisyUI 테마 변수로 연결한다(토큰 파일 하나만 바꾸는 원칙 유지).

## 반응형·모바일 UX

레이아웃은 모바일 퍼스트로 잡고, 데스크톱은 확장형으로 본다. 아래는 구현 시 전부 체크리스트로 검증한다.

**브레이크포인트**: `sm 640` / `md 768` / `lg 1024` / `xl 1280`. 기본 스타일 = 모바일, `md` 이상에서 2열·사이드 레이아웃.

**레이아웃 규칙**

- 좌우 여백 16px, 본문 최대 폭 `max-w-prose`(65ch), 데스크톱 컨테이너 1200px
- 터치 타깃 최소 44×44px, 버튼 간격 8px 이상
- 가로 스크롤 금지 (`overflow-x: hidden` 금지, 원인을 고친다)
- 뷰포트 높이는 `100dvh` 사용 — iOS 주소창 변화 대응
- `env(safe-area-inset-*)`로 노치·홈바 영역 패딩

**헤더 내비게이션**

- `sm` 이상: 프로젝트·연락 앵커 + 언어 전환 + 로그인(AuthMenu)을 한 줄에
- 모바일: 언어 전환·로그인은 그대로 두고, 앵커는 햄버거 버튼(44px) 뒤 메뉴로. 헤더 바로 아래 전폭 패널, 항목 높이 48px
- React를 쓰지 않는다: HTML Popover API(`popover` + `popovertarget`)로 열고, 바깥 탭·Esc로 닫는다. 링크를 누르면 닫는 작은 스크립트만 둔다(같은 페이지 앵커 이동 시 팝오버가 남기 때문). 구현은 `src/components/ui/Header.astro`

**모달·시트 동작 (로그인, 레터, 챗)**

- 모바일: 하단 시트(bottom sheet), 데스크톱: 중앙 모달
- 키보드가 올라오면 입력창은 하단 고정, 메시지·본문 영역만 스크롤 (`visualViewport` API로 높이 보정)
- 시트 열릴 때 배경 스크롤 잠금, 드래그 다운으로 닫기
- 폼 입력은 `inputmode`·`autocomplete` 지정 (이메일: `inputmode="email" autocomplete="email"`)

**타이포·가독성**

- 본문 16px 이상, 줄 간격 1.6, 한글은 `word-break: keep-all`
- 지금은 시스템 글꼴 스택만 쓴다(웹폰트 0KB). 한/영 폰트 페어링은 세계관 논의에서 결정하되, 웹폰트는 `font-display: swap` + 서브셋(한글은 Pretendard 가변 서브셋 권장)

**성능 예산 (모바일 4G 기준)**

| 지표 | 목표 |
| --- | --- |
| LCP | 2.0s 이하 |
| INP | 200ms 이하 |
| CLS | 0.1 이하 |
| 초기 JS | 50KB 이하 (3D·챗 제외, 둘은 지연 로드) |
| 폰트 | 2종 이하, 합계 200KB 이하 |

**3D/셰이더 분기 (옵션 단계에서 적용)**

- `navigator.hardwareConcurrency < 4` 또는 `deviceMemory < 4` 또는 `prefers-reduced-motion` → 정적 폴백
- DPR 상한 1.5, 모바일은 1.0
- 탭이 백그라운드면 렌더 루프 정지

**검증 방법**: Lighthouse 모바일 프로필 + 실기기(iOS Safari, Android Chrome) 각 1대.

## 완료 기준

- /ko, /en 모두 인트로·프로젝트·연락 섹션이 보인다
- Lighthouse 모바일 성능 90 이상, 가로 스크롤 없음
- 실기기 2대에서 레이아웃 깨짐 없음
