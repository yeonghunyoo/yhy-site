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

## 홈 (11/05, decisions S-009) — 지금 구현

`src/pages/[locale]/index.astro` + `src/lib/hero/hero.ts`(스크롤) + `src/lib/hero/scene.js`(three.js 장면·픽셀 셰이더). 세부 값·파이프라인은 [guides/3d-hero.md](guides/3d-hero.md).

- **히어로** `.story`(`data-hero`): `hero.ts`가 `.is-live`를 붙이면 높이 552vh(화면 100 + 히어로 252 + 머묾 100 + 커튼 100 — 머묾 동안 픽셀이 가운데로 모여 사라짐), 무대 `.story-stage`는 sticky. 진행도 p(0~1)로 장면·문구(`data-from`·`data-to`)를 바꾼다. WebGL이면 `scene.js`를 동적 import해 `.is-3d`, 그 전에는 `public/hero/poster.webp`(80×45, 칸 그대로 키움)
- **스크롤 관성(11/05)**: 휠이 100px씩 뛰어 장면이 끊겨서, 스크롤 위치는 목표로만 쓰고 화면 값(p·outro·커튼)은 매 프레임 목표를 따라간다(시간 상수 110ms, `hero.ts`)
- **문구 위치(11/05)**: 데스크톱(768px+)은 화면 세로 가운데에 왼쪽·오른쪽 번갈아(`data-side`), 가장자리가 아니라 바깥 여백 12vw만큼 가운데로 당김. 그늘도 그쪽 옆 그라데이션. 모바일은 아래쪽 그대로. 마지막 문장은 가운데
- **마지막 정리(11/05)**: 카메라가 다 빠지면(p ≥ 0.98) 픽셀이 가운데로 모여 사라지는 정리를 시간으로 자동 재생(1.4초, 위로 올라가면 0.6초에 되돌림) — 스크롤과 무관
- **본문 스냅(11/05)**: 정리가 끝나 마지막 문구만 남은 뒤 아래로 조금이라도 내리면 본문 첫 섹션(`#about`)까지 부드럽게 자동 스크롤(`scrollIntoView` smooth, 헤더 여백 반영). 아래로 갈 때만, 위로 올릴 때는 하지 않음. 움직임 줄이기면 히어로 자체가 꺼져 없음 — `hero.ts`. **11/06 스냅 중 입력 잠금**: 임계점을 넘으면 스냅이 끝날 때까지(0.45~0.9초) 터치·휠·스크롤 키·탭을 막는다(`html.is-snap-lock`, 터치 기기는 문서 `overflow: hidden`으로 진행 중인 손가락 스크롤·관성까지 멈춤). 손가락 스크롤이 자동 스크롤과 같이 먹어 버벅여서, 브라우저 smooth 스크롤 대신 rAF로 직접 움직인다(빠르게 출발해 천천히 닿는 ease-out)
- **커튼(패럴랙스)**: 본문 `.home-body`가 `margin-top: -100vh`로 히어로 위로 올라오고, 그동안 무대는 본문의 35% 속도로 올라가며 어두워진다(0 → 75%)
- **정적 히어로**(움직임 줄이기·스크립트 없음·WebGL 없음): 높이 78dvh, 포스터 + "BETTER CALL YH!". 글은 모두 HTML(`h1`은 시각적으로 숨긴 이름·한 줄 소개)
- **본문(S-010)**: 소개(큰 한 문장 + 문단 + 한 줄 메타) → 경력(최근 순, 지금 회사 기간만 강조색) → 스택(실무·개인 프로젝트, `src/data/stack.ts`) → 프로젝트(썸네일 16:10 — 갤러리 첫 장, 없으면 빈 칸(S-011) + 큰 제목 + 한 줄 + 스택, 지표 숫자는 강조색, 블록 전체가 상세 링크) → 연락(큰 문장 + 레터 버튼 `data-action="letter"` + `hello@`. 레터 버튼(11/05): surface 바탕 둥근 16px + 오른쪽 강조색 화살표 칸, 호버하면 강조색이 8계단(`steps(8)`, 픽셀 진행 막대)으로 왼쪽에서 차오르고 화살표 칸이 뒤집힘). 표·구분선·장식 없음, 섹션 표시는 `// 소개` 같은 작은 고정폭 글자
- **섹션 제목(11/05)**: 영어(About · Career · Stack · Projects · Contact, 한국어 페이지도), 제목 글꼴 Quantico 700 1.25~1.5rem(11/05 S-012, 이전 고정폭), `//`는 흐리게, 옆 숫자는 작게(고정폭). GitHub는 주소 대신 아이콘
- **상단 바(11/05)**: 섹션 바로가기(프로젝트·경력·연락)와 모바일 메뉴를 뺐다 — 로고와 언어 전환만
- **플로팅 목차(11/05, 데스크톱 1200px+)**: 화면 왼쪽 가운데 반투명(블러) 목차. 본문이 화면에 들어오면 나타나고, 화면 위에서 35% 선을 지난 마지막 섹션을 표시(`src/lib/toc.ts`, `aria-current`)
- **썸네일 호버 확대(11/05)**: 마우스가 있는 기기에서 썸네일에 올리면 16:10으로 잘린 칸이 이미지 원래 비율로 화면 안에 맞게 커져 위에 뜨고(헤더 아래·하단 챗 바 위, 가로 최대 960px, 원본보다 키우지 않음), 내리면 제자리로 줄어든다. 목록 자리는 그대로(글이 밀리지 않음). 커질 때 `sizes`를 바꿔 더 큰 srcset(최대 1280w)을 받는다. `src/lib/thumb-peek.ts`. 이미지 없는 빈 칸·터치 기기는 그대로
- **길게 눌러 끌기 막음(11/06)**: 링크·이미지를 길게 누르거나 클릭한 채 끌어도 브라우저 기본 드래그(유령 이미지)가 나오지 않는다 — `a, img { -webkit-user-drag: none }`(global.css) + `dragstart` 막기(`src/lib/no-drag.ts`, Firefox·Android). 입력란 안 글자 끌기는 그대로
- **바닥 여백(11/05)**: 푸터 아래 7rem(데스크톱 7.5rem) + safe-area — 맨 아래로 내려도 개인정보처리방침 링크가 챗 버튼·하단 바와 겹치지 않게
- **포커스 강조(11/05)**: 프로젝트 목록(`data-focus-list`)에서 기준선에 가장 가까운 항목 하나만 선명하고 나머지는 35%로 흐림. 기준선은 마우스가 있는 기기면 마우스 세로 위치(마우스를 두고 스크롤해도 항목이 그 아래로 지나가 같은 효과), 터치 기기·마우스가 화면 밖이면 화면 가운데. 포커스된 항목은 상세 요약(`summary`)이 나타나고(자리는 늘 차지하고 투명도만 — 높이를 접었다 펴면 스크롤 중에 글이 밀려서 11/05에 바꿈) → 와 썸네일 확대. `src/lib/focus-list.ts`. 스크립트 없음·움직임 줄이기면 흐림·접힘 없이 다 보임
- **챗(11/05, 공통)**
  - 닫힌 상태(11/05 2차): 데스크톱은 아래 가운데 긴 바(720px), 모바일은 우하단 작은 알약. 둘 다 셸 프롬프트처럼 `better-curl:~$` + 깜빡이는 커서(이름은 흐리게, `:~$`는 강조색). 문구는 뺐다(읽기 도구용 라벨만). 데스크톱 기본 표시 방식은 하단 바 — 바를 누르면 그 자리에서 이력이 있는 창으로 펼쳐지고, 창 바깥을 누르면(입력 중·답 받는 중이 아니면) 다시 바로 접힌다. **11/05 3차**: 바를 누르면 늘 하단 바로 열린다(위젯 선택은 기억하지 않음 — 예전 `chatMode` 값은 지운다). 열린 하단 바의 입력란 앞에 같은 프롬프트(`better-curl:~$`)가 붙어, 바가 그 자리에서 입력란이 되는 것처럼 보이고 바로 입력·전송할 수 있다
  - (이전) 버튼: 터미널 프롬프트 모양(`$ yh에게 물어보기` + 깜빡이는 커서), 테두리 없이 둥글게. 홈은 서버에서 숨긴 채 시작해 프로젝트 섹션이 화면 85% 위치에 오면 튀어 오르고 그 뒤로는 계속 보인다(히어로로 다시 올라가면 숨음). 다른 페이지는 처음부터. `src/lib/chat-fab.ts`가 `<html data-fab>`로
  - 창: 둥근 모서리(20px) + 그림자 토큰 `--shadow-pop`(1px 밝은 테두리 + 짧고 옅은 그림자 두 겹, 11/05 — 어두운 바탕에서 큰 검은 그림자가 탁해 보여서). 닫힌 바·알약은 `--shadow-float`, 호버하면 크기·위치·그림자는 그대로 바탕만 살짝 밝아진다, 말풍선·입력 영역도 둥글게. 제목은 고정폭(`$ 포트폴리오 에이전트`). 글꼴은 사이트 3종(Quantico·IBM Plex Sans KR·IBM Plex Mono)만
  - 히어로 전환(데스크톱): 누르면 패널이 버튼 자리·크기에서 제자리로 커지고(0.42초), 닫으면 버튼 자리로 줄어든다. 닫기 = 최소화(대화는 sessionStorage에 남음), Esc도 같음
  - 데스크톱 표시 방식: 위젯(380×560, 사이트 헤더 아래로만) / 하단 바(아래 가운데, 최대 960px × 40dvh·380px — 넓고 낮게). 위젯은 머리를 잡고 화면 안에서 드래그, 놓으면 가까운 왼쪽·오른쪽 가장자리(16px)에, 위아래 끝 64px 안이면 그쪽에도 자석처럼 붙고 위치는 localStorage `chatPos`에 기억
  - 이름 `Better-curl-dev Agent`(11/05, 화면·인사말·모델 프롬프트 `chat.ts`·`supervisor.ts`). 머리 버튼: 표시 방식 바꾸기 · 최소화(⌄/⌃, **이력만 접고 입력란은 늘 보인다** — 11/05 3차, 접힌 머리를 누르면 펼침). 아이콘은 한 벌(20px, 선 1.75, 둥근 끝, 40px 둥근 사각 버튼), 보내기도 44px 정사각 화살표 아이콘. 닫기(`×`)는 모바일 풀스크린에만(데스크톱은 최소화가 같은 역할), Esc는 어디서나 닫기
  - 말풍선은 내용 크기에 맞게(최대 85%), 보낸 쪽 오른쪽·받은 쪽 왼쪽. 칩·링크·버튼은 모두 마우스 올림(색)·누름(살짝 작아짐)·키보드 포커스(강조색 테두리) 상태가 있다. 챗 버튼은 올리면 살짝 뜨고 누르면 눌린다 내용은 안쪽 여백을 넉넉히, 목록 위·아래 끝은 흐리게 사라져 머리와 겹쳐 보이지 않는다
  - (이전) 머리의 버튼으로 바꾸고 localStorage `chatMode`에 기억. 위젯이라 뒤 페이지는 그대로 스크롤·클릭된다. 모바일은 풀스크린 그대로
  - 입력란과 보내기 버튼은 같은 높이(44px), 여러 줄이면 입력란만 커진다
- 클래스 이름: daisyUI `hero`·`hero-content`와 겹치면 레이아웃이 깨진다(11/05 실제로 깨짐) — `story-*`·`home-*`
- CSP: three.js는 같은 출처 청크라 그대로. 나중에 Meshopt 압축 모델을 쓰면 디코더가 WebAssembly라 `script-src`에 `'wasm-unsafe-eval'`이 필요하다(지금 임시 흉상은 모델 파일이 없어 해당 없음)

## 홈 (11/03) — 11/05에 걷어냄, 기록용

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

**11/05 구현 (`<head>` 쪽)**: 공용 헬퍼 `src/lib/seo.ts`(절대 URL·언어별 대응 경로·공개 페이지 목록)
- `BaseLayout`: canonical, hreflang 절대 URL + `x-default`(→ `/`), OG(`type`·`site_name`·`title`·`description`·`url`·`locale`·`locale:alternate`), `twitter:card summary`. props `type`(프로젝트 상세 `article`)·`available`(본문이 한 언어뿐인 프로젝트)·`noindex`(404)
- `src/pages/robots.txt.ts`: `/admin`·`/api/`·`/auth/`·`/media/` Disallow + sitemap 주소
- `src/pages/sitemap.xml.ts`: 홈·개인정보처리방침·프로젝트 상세를 언어마다 `<url>` 하나, `xhtml:link`로 ko·en을 잇는다. 프로젝트는 컬렉션에서 자동
- 11/05 배포(버전 `9caf7201`)
- **11/05 OG 이미지·탭 제목**: `public/og.png`(1200×630, 11/09 `src/assets/og.png`로 옮김 — 아래) — 왼쪽 "BETTER CALL YH!" + 이름·직무 + 도메인, 오른쪽 히어로와 같은 픽셀 흉상. `scripts/hero/og.html`을 `pnpm site hero:og`가 헤드리스로 찍는다(모델·문구 바꾸면 다시). `og:image`(+크기·alt), `twitter:card summary_large_image`·`twitter:title/description/image`. 탭 제목은 홈 `Yeonghun.y | iOS 개발자 · 빌더`(en `iOS Engineer & Builder`), 그 밖 `페이지 — Yeonghun.y`(i18n `site.name`·`site.role`). 크롬 탭 호버 카드는 OG가 아니라 제목·파비콘·주소를 보여 준다 — 파비콘을 픽셀 `yh`(y 흰색, h 강조색)로 바꿈
- **11/09 JSON-LD·`llms.txt`**: 화면과 같은 데이터(i18n·`career.ts`·`stack.ts`·projects 컬렉션)에서 만든다
  - `src/lib/jsonld.ts` → `BaseLayout` prop `jsonLd`(`<script type="application/ld+json" is:inline>`, `<`는 `\u003c`로). 홈 `@graph`에 `Person`(`@id` `/#person`, 이름·별칭·`jobTitle`·`email`·`sameAs` GitHub·`worksFor` 지금 회사·`knowsAbout` 스택) + `WebSite`(`@id` `/#website`). 프로젝트 상세 `CreativeWork`(제목·요약·`keywords` 스택·`dateCreated` `period` 시작 달·`author` → `/#person`·`isPartOf` → `/#website`)
  - 사람 이름은 i18n `site.person`(유영훈 / Yeonghun Yoo)
  - `src/pages/llms.txt.ts`(prerender): 제목·한 줄 요약 뒤 영어 → 한국어 순으로 소개·경력·스택·프로젝트(링크·요약·기간·대표 수치·스택)·연락, 끝에 개인정보처리방침·sitemap. 공개 페이지 `<head>`에 `<link rel="alternate" type="text/plain" href="/llms.txt">`
  - 배포 뒤 확인: Google 리치 결과 테스트(search.google.com/test/rich-results)·Schema Markup Validator(validator.schema.org)에 홈·프로젝트 상세 주소
- **11/09 SEO 체크리스트 점검과 후속**(S-015): 빌드 HTML 12쪽·운영 curl·JS 끈 Chromium·Lighthouse 모바일로 점검. 고친 것
  - 개인정보처리방침 고유 description(홈과 같았다)
  - `apple-touch-icon`(180×180, `public/apple-touch-icon.png`) — 파비콘 SVG에서 `pnpm site icon:apple`가 찍는다(둥근 모서리 빼고 80%로 줄여 가운데)
  - OG 이미지를 `src/assets/og.png`로 옮겨 빌드 자산으로(`/_astro/og.<해시>.png`). 다시 찍으면 주소가 바뀌어 카카오·페이스북의 예전 이미지 캐시를 피한다. 크기도 파일에서 읽는다
  - 프로젝트 상세 첫 이미지 `fetchpriority="high"`(LCP 요소)
  - 끝 슬래시 없는 언어 페이지(`/ko`, `/en/privacy`)는 Worker가 301로 `/ko/`에(정적 자산 처리가 307 임시 이동을 써서). 규칙 `src/lib/redirects.ts`, 확인 `pnpm site test`
  - 홈 TBT: 3D 히어로 시작을 늦추고 쪼갰다 — [guides/3d-hero.md](guides/3d-hero.md) "시작 순서(11/09)"
  - 자동 점검 `scripts/seo-check.mjs`(아래)
- 점검에서 통과한 것: lang·charset·viewport, title·description(언어 쌍 제외 고유), canonical 자기 절대 주소(쿼리 무시), OG·Twitter 중복 없음·`og:url` = canonical, hreflang 양방향 + x-default, sitemap = 색인 페이지, 404 실제 상태 코드 + 홈 링크, JS 없이 본문·링크 보임, h1 하나·제목 단계, 이미지 alt·크기·webp·srcset·lazy, 혼합 콘텐츠 없음, 글꼴 `font-display: swap`
- 남은 것(운영자): Cloudflare **Always Use HTTPS**(지금 http로 오면 200 — `.dev`는 브라우저가 늘 https라 급하지 않다), Web Analytics를 쓸지(지금 대시보드에서 켜져 비콘이 자동으로 붙는데 CSP가 막아 콘솔 오류 + 수집 안 됨 — 쓰면 CSP `script-src`·`connect-src`에 Cloudflare 주소, 안 쓰면 대시보드에서 끈다), 홈 description 문구(36자, 권장 40~120자), Search Console·네이버 서치어드바이저·Bing 등록 + sitemap 제출, 카카오·페이스북 공유 디버거

**자동 점검(11/09, S-015)**: `pnpm site seo:check` — 빌드 결과(`dist/client`)를 읽는다. `scripts/deploy.sh`가 빌드 뒤 돌리고 **오류면 배포를 멈춘다**. 라이브러리 없이 정규식
- 오류: charset 위치·viewport·lang·title·description·파비콘 없음, canonical 없음/자기 주소 아님, OG·Twitter 태그 없음·중복, `og:url` ≠ canonical, `og:image` 상대 주소·빌드에 파일 없음, hreflang 자기 언어·x-default 없음·한쪽 방향, h1 ≠ 1, `<main>` 없음, JSON-LD 파싱 실패, img alt 없음, title·description 중복(같은 글 ko·en의 제목은 허용), sitemap ≠ 색인 페이지, robots.txt Sitemap 줄 없음·전체 차단
- 경고: title·description 길이(ko title 40자·en 65자, description ko 40~120자·en 70~170자), 제목 단계 건너뜀, img 크기 없음, `target=_blank`에 noopener 없음, apple-touch-icon·`llms.txt` 없음

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

**미결**(11/09 기준 둘 다 끝남 — 도메인 11/04 `bettercurl.dev`, OG는 정적 한 장): 도메인(`overview.md` "미결정 사항"), OG 이미지 방식 — 정적 한 장(`public/og.png`) vs 빌드 때 프로젝트별 생성(`@napi-rs/canvas`, 런타임 비용 없음)

## 홈 개편안 (11/05, 제안 — decisions S-007)

위 "홈 (11/03)"의 자유 배치 캔버스를 **구조화된 정적 템플릿**으로 바꾸자는 안이다. 확정 전까지 코드는 11/03 그대로다. 테마(나이트)·글꼴(Black Han Sans + IBM Plex Mono, 본문 IBM Plex Sans KR)·`tokens.css`는 바꾸지 않는다.

**방향**: 열을 맞춘 목록·표, 고정폭 글꼴 작은 라벨, 얇은 구분선. 엇갈린 배치·커서 태그·선택 핸들은 뺀다. 스크립트 없이 완성된 HTML이고, 같은 데이터로 화면과 JSON-LD·`llms.txt`를 만든다(SEO·GEO).

**페이지**: 새 페이지는 만들지 않는다 — `/{locale}/`(홈), `/{locale}/projects/{slug}/`(상세), `/{locale}/privacy/`. sitemap은 그대로다. 프로젝트가 많아지면 `/{locale}/projects/` 목록을 따로 낸다

**홈 섹션 (위에서부터, h1 하나 + 섹션마다 h2)**

| # | 섹션 | 구성 | 레퍼런스(Mobbin) |
| --- | --- | --- | --- |
| 1 | 소개 | h1 이름, 한 줄 역할, 소개 문단. `md` 이상에서 오른쪽 정보 칸: 총 경력 · 지금 · GitHub · 연락(`hello@`) | [GitHub ReadME Project 프로필](https://mobbin.com/sites/sections/10928b8e-852d-4424-b248-8028e8ff92d5) |
| 2 | 프로젝트 | 텍스트 인덱스 표 — 번호 · 이름 · 한 줄 설명(`short`) · 기간(`period`) · 지표(`metric`). 행 전체가 상세 링크(펼침 버튼 없음). 모바일은 행마다 두 줄 | [Locomotive 프로젝트 인덱스](https://mobbin.com/sites/sections/280c1a2d-41d4-4495-a4bd-816763c93ad3), 스택 태그는 [Wild](https://mobbin.com/sites/sections/bd58336d-6de6-4678-aafd-10089a509897) |
| 3 | 경력 | 표 — 회사(+파견 등 note) · 기간(11/05: 역할 열 없음). 표 위에 총 경력 한 줄(기존 이어 붙인 막대는 선택) | [Webflow 3단 표](https://mobbin.com/sites/sections/cd3b84b1-6a90-4caf-a6a7-82c1a1522786), 톤은 [Linear 어두운 목록](https://mobbin.com/sites/sections/b94b791e-21d7-46d0-95e8-cd3ec25fc5ee) |
| 4 | 연락 | 레터 버튼 + `hello@bettercurl.dev` | — |

**데이터**: `src/data/career.ts` 그대로(11/05: 역할 열을 두지 않아 `role` 불필요). 프로젝트는 지금 frontmatter(`short`·`period`·`metric`·`stack`)로 충분하다

**같이 붙일 것**: JSON-LD 홈 `Person`(이름·`jobTitle`·`worksFor`·`sameAs` GitHub·`email`) + `WebSite`, 프로젝트 상세 `CreativeWork`. `llms.txt`는 소개·프로젝트 인덱스·경력 표와 같은 데이터

**11/05 사용자 답 — 4가지 모두 지금 것 유지**: 이름 글자 그림 남김(소개 h1 자리) · 경력 표에 역할 열을 따로 두지 않음(회사·note·기간) · 프로젝트 목록에 썸네일 없음 · 숫자 연출 남김(`reduced-motion`이면 없음)

**미결이던 것 (11/05 위 답으로 정함)**
- 이름 글자 그림(ASCII 연출)을 남길지 — 남기면 소개 h1 자리에, 빼면 큰 글자 그대로
- 경력 역할 문구(회사별)
- 프로젝트 표에 썸네일을 넣을지(넣으면 `md` 이상에서만, 갤러리 첫 장)
- 숫자 올라가는 연출을 남길지(`prefers-reduced-motion`이면 어차피 없음)

**11/05 보탬 — 테마·스크롤 스토리(S-008 제안)**: 홈은 내리면서 장이 진행되는 스크롤 스토리로, 첫 장은 "Better call yh!" 3D 픽셀 히어로. 흐름·파일·명령은 [guides/3d-hero.md](guides/3d-hero.md)

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
- 글꼴 3종(11/05, S-012): 제목 Quantico 700(라틴, 각진 기계 글꼴 — 한글은 IBM Plex Sans KR 700으로 이어짐), 숫자·라벨 IBM Plex Mono(라틴 400·500), 본문 IBM Plex Sans KR 400·700(11/04, 숫자·라벨의 Plex Mono와 같은 가족, 한글 조각별 로드). `@fontsource`로 자체 호스팅(CSP `font-src 'self'`), Plex Sans KR은 글자 범위별 조각이라 페이지에 쓰인 조각만 받는다. (이전 11/03: 제목 Black Han Sans) 작은 조각이 `data:`로 인라인되면 CSP에 막히므로 `astro.config.mjs`에서 글꼴 파일은 인라인하지 않는다

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

## 상호작용과 면 (11/11, S-022 잠정 — dev에서 확인 중)

**움직임 토큰**(tokens.css): `--dur` 160ms, `--dur-press` 60ms, `--ease` cubic-bezier(0.2, 0.8, 0.2, 1)

**버튼**(daisyUI `.btn` 위에 global.css 끝에서 덮음): 선 없이 `--color-surface-2` 면 + 위쪽 `--color-edge`. 마우스 호버 1px 떠오름·`--color-surface-3`(주 버튼은 `--color-accent-hover`), 누름 가운데 기준 `scale(0.97)` — 마우스는 `translateY(-1px) scale(0.97)`로 떠오른 자리 그대로. 터치는 누름만. 움직임 줄이기면 크기·위치 변화 없음

**목록 제목**(홈 프로젝트 `.home-work`, 블로그 `.blog-list`): 마우스 호버 = 제목 강조색(+ 홈은 화살표·썸네일 확대), 터치 = 누르는 동안 제목 강조색(+ 블로그는 줄 바탕)

**규칙**
- 호버는 `@media (hover: hover) and (pointer: fine)` 안에만(Tailwind는 `pointer-fine:hover:`) — 휴대폰에서 호버가 눌린 채 남는다
- 누름은 `:active`. iOS는 문서에 빈 `touchstart` 리스너가 있어야 보인다(BaseLayout). 휴대폰 기본 탭 번쩍임은 끈다(`-webkit-tap-highlight-color: transparent`)
- 크기 변화는 늘 가운데 기준(`transform-origin: 50% 50%`)

**면의 층(선 없음)**: 바탕 `--color-bg` → 컨테이너 `--color-surface` → 그 안 `--color-surface-2` → 호버·누름 `--color-surface-3`. 안쪽이 늘 한 단계 밝다(어두우면 묻힌다). 코드 블록만 바탕보다 어둡게(`--code-bg`, 이름표 띠 `--code-bar`)
- 선을 남기는 곳: 입력칸(`.field`), 키보드 포커스, 구조 구분(글 머리 아래, 표 줄, 변경 이력 타임라인, 단계 세로선). 어드민은 이번 범위 밖
- 11/11 바꾼 곳: 버튼 전체, 블로그 목록·코드 블록·콜아웃·이미지·단계 번호, 프로젝트 상세 스택 칩·갤러리 썸네일과 화살표, 챗 제안 칩, 시트 테두리

