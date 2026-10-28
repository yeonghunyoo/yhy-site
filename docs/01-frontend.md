# 1단계 · 프론트엔드 + 반응형 UX

정적 HTML이 기본이고, 로그인·레터 모달·챗·3D만 React 아일랜드로 띄운다. 어드민과 인증 콜백만 SSR이다. 모바일이 1차 타깃이다.

## Astro 구조

**렌더링 모드**: `output: 'static'` (Astro 5+, 구 `hybrid` 모드가 여기에 통합됨) — 기본 정적(prerender), `/admin/*`·`/api/*`·`/auth/*`만 페이지에 `export const prerender = false`. 어댑터는 `@astrojs/cloudflare`.

**i18n**: Astro 내장 `i18n` 설정, `defaultLocale: 'ko'`, `locales: ['ko','en']`, `prefixDefaultLocale: true`. 루트 `/`는 `Accept-Language`로 `/ko` 또는 `/en`으로 리다이렉트(미들웨어). 문자열은 `src/i18n/ko.json`·`en.json`, 긴 본문(프로젝트 설명)은 `src/content/projects/{slug}.ko.md`·`.en.md`로 Content Collections에 둔다.

**섹션 (1차)**

1. 인트로 — 이름 + 한 줄. 나중에 3D 아일랜드가 배경으로 들어갈 자리. 챗 독(2차)도 이 화면 우하단에 접힌 상태로 위치
2. 프로젝트 — "이 포트폴리오" 상세: 문제 / 접근 / 결과 / 기술 스택 / 변경 이력(빌드 로그 형식, 최신순)
3. 연락 — 로그인 버튼 + 레터 보내기 (비로그인 시 로그인 유도)

**디렉터리 구조**

```
src/
  pages/[locale]/index.astro       # 인트로 + 프로젝트 + 연락
  pages/[locale]/projects/[slug].astro
  pages/admin/*.astro              # SSR, 세션 체크
  pages/api/*.ts                   # letters, chat(2차)
  pages/auth/[...all].ts           # Better Auth 핸들러
  components/ui/                   # Astro 컴포넌트 (Tailwind)
  components/islands/              # React: LoginModal, LetterModal, ChatDock, Hero3D
  content/projects/                # ko/en 마크다운
  i18n/                            # ko.json, en.json
  lib/auth.ts, lib/db.ts, lib/mail.ts
  middleware.ts                    # locale 리다이렉트, admin 가드
```

**아일랜드 로딩 전략**

| 아일랜드 | 지시어 | 이유 |
| --- | --- | --- |
| LoginModal, LetterModal | `client:idle` | 첫 페인트 후 로드, 클릭 즉시 반응 |
| ChatDock (2차) | `client:idle` | 접힌 독만 먼저, 패널은 열 때 동적 import |
| Hero3D (옵션) | `client:visible` + 저사양 감지 | 모바일·저사양은 정적 그라디언트 폴백 |

**스타일**: Tailwind v4. 디자인 토큰은 `src/styles/tokens.css`의 CSS 변수로 두고, 세계관 콘셉트가 정해지면 이 파일만 교체한다. 컴포넌트 라이브러리는 디자인 MCP 결정 후 추가.

## 반응형·모바일 UX

레이아웃은 모바일 퍼스트로 잡고, 데스크톱은 확장형으로 본다. 아래는 구현 시 전부 체크리스트로 검증한다.

**브레이크포인트**: `sm 640` / `md 768` / `lg 1024` / `xl 1280`. 기본 스타일 = 모바일, `md` 이상에서 2열·사이드 레이아웃.

**레이아웃 규칙**

- 좌우 여백 16px, 본문 최대 폭 `max-w-prose`(65ch), 데스크톱 컨테이너 1200px
- 터치 타깃 최소 44×44px, 버튼 간격 8px 이상
- 가로 스크롤 금지 (`overflow-x: hidden` 금지, 원인을 고친다)
- 뷰포트 높이는 `100dvh` 사용 — iOS 주소창 변화 대응
- `env(safe-area-inset-*)`로 노치·홈바 영역 패딩

**모달·시트 동작 (로그인, 레터, 챗)**

- 모바일: 하단 시트(bottom sheet), 데스크톱: 중앙 모달
- 키보드가 올라오면 입력창은 하단 고정, 메시지·본문 영역만 스크롤 (`visualViewport` API로 높이 보정)
- 시트 열릴 때 배경 스크롤 잠금, 드래그 다운으로 닫기
- 폼 입력은 `inputmode`·`autocomplete` 지정 (이메일: `inputmode="email" autocomplete="email"`)

**타이포·가독성**

- 본문 16px 이상, 줄 간격 1.6, 한글은 `word-break: keep-all`
- 한/영 폰트 페어링은 세계관 논의에서 결정하되, 웹폰트는 `font-display: swap` + 서브셋(한글은 Pretendard 가변 서브셋 권장)

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
