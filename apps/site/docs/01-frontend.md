# 1단계 · 프론트엔드 + 반응형 UX


> **2026-11-04 변경 — 방문자 로그인 없앰**: 방문자 화면에는 로그인·계정 메뉴가 없다. 레터와 챗은 로그인 없이 쓰고, 로그인은 관리자만 `/admin`에서 한다(로그인 안 됐으면 `/admin`이 로그인 화면, 로그인했지만 관리자가 아니면 "권한 없음" + 로그아웃). 아래 본문 중 방문자 로그인·로그인 유도·계정 메뉴·계정 삭제 시트 이야기는 11/04 이전 기록이다.

정적 HTML이 기본이고, 로그인·레터 모달·챗·3D만 React 아일랜드로 띄운다. 어드민과 인증 콜백만 SSR이다. 모바일이 1차 타깃이다.

## Astro 구조

**렌더링 모드**: `output: 'static'` (Astro 5+, 구 `hybrid` 모드가 여기에 통합됨) — 기본 정적(prerender), `/admin/*`·`/api/*`·`/auth/*`만 페이지에 `export const prerender = false`. 어댑터는 `@astrojs/cloudflare`.

**i18n**: Astro 내장 i18n 라우팅은 쓰지 않는다(접두어 없는 `/admin`까지 404로 만든다). `src/pages/[locale]/`의 `getStaticPaths`로 `/ko`·`/en`을 만들고, 루트 `/`는 `src/pages/index.astro`(동적)가 `Accept-Language`로 `/ko` 또는 `/en`에 302로 보낸다. 문자열은 `src/i18n/ko.json`·`en.json`(+ `src/i18n/index.ts` 헬퍼), 긴 본문(프로젝트 설명)은 `src/content/projects/{slug}.ko.md`·`.en.md`로 Content Collections에 둔다(id는 파일명 그대로 `{slug}.{locale}`).

**섹션 (1차)**

1. 소개 — 글자로 그린 이름 + 캐치프레이즈 + 짧은 소개 문단 + 경력·지금·GitHub (11/03, 아래 "홈")
2. 프로젝트 — 큰 숫자 + 이름 덩어리 3개를 엇갈려 배치, 누르면 한 줄 설명과 상세 링크. 상세 페이지: 문제 / 접근 / 결과 / 기술 스택 / 변경 이력
3. 경력 — 기간만 이어 붙인 막대 하나(합계 = 총 경력). 날짜 축 없음 — 회사 사이 공백은 보여 주지 않는다
4. 연락 — 큰 "레터 →" (비로그인 시 로그인 유도)

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

**스타일**: Tailwind v4. 디자인 토큰은 `src/styles/tokens.css`의 CSS 변수로 두고, 세계관 콘셉트가 정해지면 이 파일만 교체한다. UI 레퍼런스는 Mobbin, 컴포넌트는 daisyUI 5(`global.css`의 `@plugin 'daisyui' { themes: false; }`). 내장 테마는 끄고, daisyUI 테마 변수(`--color-base-*`, `--color-primary`, `--radius-field`, `--size-field` 등)를 `tokens.css`에서 기존 토큰으로 연결한다 — 세계관이 정해지면 이 파일만 바꾼다. 버튼은 daisyUI(`btn`, `btn-primary`, `btn-error`, `btn-outline`), 높이는 `--size-field`로 44px. 입력칸은 iOS 확대 방지(16px)를 위해 자체 `.field`를 유지한다(daisyUI `input`은 기본 14px).

## 홈 (11/03)

레퍼런스는 Mobbin의 Clipo(자유 배치, 큰 글자, 괄호 라벨, 선택 핸들, 커서 태그). 시안은 claude.ai 아티팩트 "yhy 홈 시안". 문서 같은 줄·표를 버리고 캔버스(모바일 6칸 / 820px 이상 12칸 그리드) 위에 덩어리를 비대칭으로 놓는다. 구현은 `src/pages/[locale]/index.astro`(마크업·스타일) + `src/lib/home.ts`(연출, React 없음).

- 테마: `tokens.css` — 나이트 한 가지(#17191c 바탕, 연보라 파랑 강조). 기기의 밝은·어두운 설정과 상관없이 같다(`<meta name="color-scheme" content="dark">`). 강조 `--color-accent`, 커서 태그 `--color-tag` 분홍, 큰 괄호 라벨 `--color-ghost`
- 이름: 글꼴 모양을 캔버스에 그려 칸마다 채움 정도를 `. : - = + * # % @` 중 하나로 바꾼 글자 그림(모바일 44칸, 넓으면 72칸). 처음엔 무작위 글자가 왼쪽부터 제자리를 찾는다. 포인터 둘레 보이지 않는 원 안의 글자는 원 바깥 띠로 밀려난다(거리 d → d < R: R + 0.35d, R ≤ d < 2R: d + 0.35(2R − d)). 상자는 5:3 비율로 미리 잡아 둬 레이아웃이 밀리지 않는다. 스크립트가 없으면 큰 글자 그대로
- 소개 문단은 평범한 글(11/03: 포인터 둘레로 글이 흐르는 Pretext 효과는 뺐다)
- 터치: 이름 그림만, 탭(`src/lib/tap-peek.ts`) — 누른 자리에 0.9초 보였다 사라진다. 드래그로 따라가지 않고 스크롤을 막지 않는다(11/03 변경: 누른 채 드래그는 스크롤을 방해해 뺐다). 마우스는 올리기만 해도 된다
- 숫자: 화면에 들어올 때 0부터 해당 값까지 올라간다(경력은 개월 단위로 "1년 11개월"). 밑줄·경력 막대는 왼쪽부터 찬다. 서버가 최종 값을 그려 두고 스크립트가 0으로 되돌린 뒤 올린다. `prefers-reduced-motion`이면 연출 없이 값만
- 프로젝트: content collection에 `short`·`metric { value, unit, label }`·`period`(선택)를 둔다. 누르면 선택 핸들 + 설명(`aria-expanded`). 경력은 `src/data/career.ts`(개월 수만, 지금 회사는 빌드한 달까지)
- CSP: HTML `style=""` 금지라 비율 막대는 SVG 속성, 실행 중 위치는 스크립트(CSSOM)로 쓴다
- 클래스 이름: daisyUI 컴포넌트(`hero`·`label`·`timeline` 등)와 겹치면 레이아웃이 깨진다 — 홈은 `intro`·`big-label`·`career-line`
- 초기 JS: 홈 스크립트 gzip 3.7KB(11/03 측정)

## 프로젝트 상세 — 이미지 (11/04)

상세 페이지 제목·요약 아래에 프로젝트 이미지를 보여 준다. 구현은 `src/components/ui/ProjectGallery.astro`(마크업) + `src/lib/gallery.ts`(뷰어, React 없음).

- 원본: `src/content/projects/{slug}/` 폴더에 두고, 언어별 마크다운 frontmatter `images: [{ src: ./{slug}/01.png, alt: … }]`로 순서·대체 텍스트를 적는다(alt는 언어마다). 없으면 갤러리를 그리지 않는다
- 최적화: 빌드 때 Astro 이미지(`imageService: 'compile'`)가 WebP로 줄인다 — 목록용 480/960/1440px srcset, 크게 보기용 긴 변 2400px 이하 한 장. 같은 출처라 CSP `img-src 'self'` 그대로
- 목록: 가로 scroll-snap 슬라이드(스크립트 없이도 넘어간다). 높이 고정(모바일 18rem, `md` 28rem), 폭은 이미지 비율대로. 여러 장이면 "1 / N" 카운터, 마우스 기기(`pointer: fine`)에는 이전·다음 버튼(44px)
- 크게 보기: 이미지를 누르면 전체 화면 `<dialog>`. 두 손가락 핀치·휠로 확대(최대 4배), 확대 중 한 손가락 끌기 = 이동, 두 번 탭 = 맞춤 ↔ 2.5배, 맞춤 상태에서 좌우 밀기 = 이전·다음, 아래로 밀기 = 닫기. 키보드 ←/→·+/−/0·Esc. 열 때 히스토리를 하나 쌓아 Android 뒤로 가기로 닫힌다. 처음엔 목록 이미지를 보여 주고 큰 이미지가 오면 바꾼다(현재·양옆만 미리 받는다). 닫으면 목록도 보던 장으로 맞춘다
- 배경 스크롤 잠금은 공용 `scroll-lock.ts`. `prefers-reduced-motion`이면 넘김·닫기 전환 없이 바로

## SEO·GEO (11/04)

검색엔진과 AI 답변 엔진(ChatGPT·Claude·Perplexity·Google AI 개요) 둘 다 같은 것을 본다: 스크립트 없이 읽히는 HTML, 구조가 분명한 본문, 확실한 출처 URL. 정적 prerender와 `/ko`·`/en` 분리라 바탕은 되어 있다. 아래는 그 위에 더할 것이다.

**원칙 (지금부터 모든 페이지에)**
- 공개 페이지는 `BaseLayout`에 `title`·`description`을 넘긴다. 빠지면 사이트 기본값이 들어가 페이지마다 같아진다
- 색인하지 않는 곳: `/admin/*`·`/api/*`·`/auth/*`. 화면은 `AdminLayout`이 `noindex`, robots.txt가 Disallow
- 도메인을 코드에 쓰지 않는다. 절대 URL은 `Astro.site`(= `astro.config.mjs`의 `site`)에서 만든다
- 크롤러·공유 미리보기가 받아 갈 파일(OG 이미지 등)은 `public/`이나 빌드 자산(`/_astro`)에 둔다. `/media/*`는 Worker가 R2에서 꺼내 주는 동적 경로라 순간 제한(`request-guard.ts`)과 R2 읽기 비용을 거친다 — 크롤러가 몰리면 429가 나거나 한도를 쓴다
- 프로젝트 마크다운 본문 첫 문단에 무엇·왜·결과를 한두 문장으로 쓴다. AI가 인용하는 곳이 보통 첫 문단이다. 수치·기간·스택은 frontmatter(`metric`·`period`·`stack`)에만 두지 말고 본문에도 글로 쓴다

**지금 상태 (11/04)**: `description`·hreflang만 있다. hreflang은 상대 경로이고 `x-default`·canonical이 없다. robots.txt·sitemap·OG·구조화 데이터 없음

**구현 계획**

| 항목 | 위치 | 도메인 필요 |
| --- | --- | --- |
| 관리자 화면 `noindex` | `src/layouts/AdminLayout.astro` | 아니오 |
| JSON-LD: 홈 `Person` + `WebSite`, 프로젝트 상세 `CreativeWork` | 각 페이지에서 `BaseLayout`에 넘긴다. `<script type="application/ld+json" set:html>` — 실행되지 않는 데이터라 CSP와 상관없다 | URL만 |
| `llms.txt`: 소개 한 단락, 프로젝트별 한 줄 요약과 링크(ko·en) | `src/pages/llms.txt.ts`(prerender), `projects` 컬렉션과 `src/data/career.ts`에서 만든다 | URL만 |
| `site` 설정 | `astro.config.mjs` | 예 |
| canonical, hreflang 절대 URL과 `x-default`(→ `/`, 언어 선택 리다이렉트) | `BaseLayout.astro` | 예 |
| OG·Twitter 메타 | `BaseLayout` props에 `image`·`type` 추가 | 예 |
| sitemap(ko·en 서로 연결, 관리자 제외) | `@astrojs/sitemap` 또는 `src/pages/sitemap.xml.ts` | 예 |
| robots.txt(Disallow + sitemap 주소) | `src/pages/robots.txt.ts`(prerender) | 예 |

JSON-LD·`llms.txt`는 도메인 전에 만들어 두고 URL만 `Astro.site`로 바꾼다.

**운영자가 할 일 (코드 밖)**
- Cloudflare 대시보드의 AI 크롤러 차단(Block AI bots, managed robots.txt 등)이 켜져 있으면 GPTBot·ClaudeBot·PerplexityBot이 막힌다. 노출하려면 끈다
- 도메인 확정 뒤 Google Search Console·Bing Webmaster Tools에 등록하고 sitemap을 낸다

**미결**: 도메인(`overview.md` "미결정 사항"), OG 이미지 방식 — 정적 한 장(`public/og.png`) vs 빌드 때 프로젝트별 생성(`@napi-rs/canvas`, 런타임 비용 없음)

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
  - 챗 독(11/03): 모바일 풀스크린 패널을 `visualViewport`의 높이와 `offsetTop`에 맞춘다(iOS Safari는 키보드가 떠도 레이아웃 뷰포트를 줄이지 않고 화면을 밀어 올린다 — 높이만 맞추면 패널 아래가 비어 보인다). 열려 있는 동안 `body`를 `position: fixed`로 고정해 배경이 스크롤되지 않게 하고 닫을 때 위치를 되돌린다. 키보드가 떠 있으면 아래쪽 safe-area 여백을 뺀다. 뷰포트 메타에 `interactive-widget=resizes-content`(Chrome Android가 키보드만큼 레이아웃을 줄이게)
- 시트 열릴 때 배경 스크롤 잠금, 드래그 다운으로 닫기
- 폼 입력은 `inputmode`·`autocomplete` 지정 (이메일: `inputmode="email" autocomplete="email"`)

**로딩 상태 (11/03)**

- 비동기 동작을 시작하는 버튼은 진행 중에 `disabled` + `aria-busy="true"`. `global.css`가 글자를 숨겨 폭을 유지하고 가운데에 스피너를 그린다(버튼·메뉴 항목 공통). 실패하면 둘 다 풀어 다시 누를 수 있게 한다
- 하이드레이트 전 첫 클릭(`client:demand`)은 아일랜드 DOM을 건드리지 않고 `<html data-ui-pending="동작">`으로 같은 스피너를 낸다(React 받는 동안)
- 어드민의 일반 폼·오래 걸리는 링크(`data-busy-link`)는 `AdminLayout`의 스크립트가 같은 `aria-busy`를 건다. 두 번 전송을 막고, 뒤로 가기(bfcache)로 돌아오면 되돌린다
- 챗 답변 대기는 말풍선 안에 daisyUI `loading-dots` + "답을 찾는 중", 그동안 입력칸은 읽기 전용, 보내기 버튼은 스피너
- 움직임 줄이기(`prefers-reduced-motion`)에서는 스피너를 멈추지 않고 느리게만 돌린다
- 페이지 이동(11/03): 같은 사이트의 다른 페이지로 가는 링크·폼 전송은 화면 맨 위 2px 막대가 차오른다(`src/components/ui/NavProgress.astro`, 사이트·어드민 레이아웃 공통). 같은 페이지 앵커·새 탭·외부 링크는 제외, 뒤로 가기(bfcache)로 돌아오면 끈다. 화면 읽기 프로그램에는 "불러오는 중…"
- 지연 로드: 챗 흐름도는 받는 동안 점 세 개(Suspense)

**타이포·가독성**

- 본문 15px(11/04, 16px에서 줄임 — 루트 16px는 그대로라 버튼·입력 44px 높이는 유지), 줄 간격 1.6, 한글은 `word-break: keep-all`. 입력칸은 iOS 확대 방지로 16px 유지
- 글꼴 2종(11/03): 제목 Black Han Sans, 숫자·라벨 IBM Plex Mono(라틴 400·500). 본문은 IBM Plex Sans KR 400·700(11/04, 숫자·라벨의 Plex Mono와 같은 가족, 한글 조각별 로드). `@fontsource`로 자체 호스팅(CSP `font-src 'self'`), Black Han Sans는 글자 범위별 조각이라 페이지에 쓰인 조각만 받는다. 작은 조각이 `data:`로 인라인되면 CSP에 막히므로 `astro.config.mjs`에서 글꼴 파일은 인라인하지 않는다

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

**브라우저·OS 대응**: 지원 범위(Safari·iOS 16.4+, Chrome 111+), 11/03 전수 점검 결과·고친 것·실기기 확인 목록은 [guides/browser-support.md](guides/browser-support.md). 배경 스크롤 잠금은 공용 `scroll-lock.ts`(body 고정, 잠금 횟수 계산)를 쓰고, 배포 직후 예전 HTML이 사라진 JS를 부르면 `client:demand`가 한 번 새로고침해 누르던 동작을 이어간다.

## 완료 기준

- /ko, /en 모두 인트로·프로젝트·연락 섹션이 보인다
- Lighthouse 모바일 성능 90 이상, 가로 스크롤 없음
- 실기기 2대에서 레이아웃 깨짐 없음
