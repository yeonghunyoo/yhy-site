# nuvo SEO·GEO 체크리스트

2026-11-10 작성. 포트폴리오(site)의 SEO 점검 기준(`apps/site/docs/01-frontend.md` "SEO·GEO", `pnpm site seo:check`)을 nuvo에 맞춰 옮긴 것입니다.
상태 표시: ✅ 됨 / ⬜ 할 일 / 🌐 도메인이 있어야 함 / 👤 사람(운영자) 작업 / 📱 모바일 앱 단계.

## nuvo가 포트폴리오와 다른 점

- **노출하는 쪽이 좁다.** 비공개 사진 서비스라 검색에 내보내는 건 랜딩(`/`)과 앞으로 생길 공개 문서(`/terms`·`/privacy`)뿐이고, 나머지는 noindex입니다([decisions.md](decisions.md) D-004, [mvp.md](mvp.md) "검색 노출")
- **화면이 SPA다.** 포트폴리오는 Astro 정적 HTML이라 스크립트 없이 본문이 보이지만, nuvo는 `index.html`의 `<div id="root"></div>`가 비어 있고 React가 그립니다. Google은 스크립트를 실행해 읽지만, **네이버·Bing 일부와 대부분의 AI 크롤러(GPTBot·ClaudeBot·PerplexityBot)는 빈 페이지를 봅니다.** nuvo SEO의 가장 큰 공백입니다
- **한국어만.** hreflang·언어별 경로는 필요 없습니다(영어판을 만들 때 다시)
- **도메인이 아직 없다.** canonical·`og:url`·sitemap·robots의 Sitemap 줄은 도메인이 정해져야 넣습니다

## 1. 색인 범위 (D-004)

| 항목 | 상태 | 메모 |
|---|---|---|
| `/` 외 모든 화면 `X-Robots-Tag: noindex` | ✅ | `public/_headers`. 배포 뒤 `curl -I`로 실측 필요 |
| `/api/*`·`/m/*` noindex | ✅ | Worker 응답 |
| robots.txt (`/`만 허용) | ✅ | `public/robots.txt` |
| robots.txt `Sitemap:` 줄 | ⬜🌐 | |
| `/terms`·`/privacy` 공개 + 색인 허용 | ⬜ | 페이지 자체가 ④ 약관 작업 대기. 생기면 `_headers`에서 noindex를 떼고 sitemap에 넣음 |
| `/account/delete`는 noindex 유지 | ✅ | 스토어 요건은 "열리는 주소"이지 색인이 아님 |
| sitemap.xml (`/` + 공개 문서) | ⬜🌐 | 정적 파일로 충분(페이지가 몇 개 안 됨) |

## 2. `<head>` 기본

| 항목 | 상태 | 메모 |
|---|---|---|
| `lang`·charset·viewport | ✅ | |
| title (15자) | ✅ | `nuvo · 가족 사진을 한곳에`. 포트폴리오 기준(ko 40자 이하) 안 |
| description (약 55자) | ✅ | 기준 40~120자 안. 아래 5번 문구 개편 때 같이 손봄 |
| **파비콘** | ⬜ | **없음** — 탭·검색 결과·북마크에 기본 아이콘이 나옴. `public/favicon.svg` + `<link rel="icon">` |
| `apple-touch-icon` (180×180) | ⬜ | 포트폴리오처럼 파비콘 SVG에서 찍기 |
| 웹 앱 매니페스트 | ⬜ | `manifest.webmanifest`(이름·아이콘·테마 색). CSP에 `manifest-src 'self'`는 이미 있음 |
| canonical | ⬜🌐 | `https://도메인/` |
| `theme-color`·`color-scheme` | ✅ | |

## 3. 공유 미리보기 (OG·Twitter)

| 항목 | 상태 | 메모 |
|---|---|---|
| `og:type`·`og:title`·`og:description` | ✅ | |
| `og:site_name`·`og:locale`(ko_KR) | ⬜ | |
| `og:url` | ⬜🌐 | canonical과 같게 |
| **OG 이미지** (1200×630) | ⬜ | 없음 → 카카오톡·메신저에 링크를 붙이면 그림 없는 카드. 정적 한 장으로 충분. 포트폴리오처럼 **빌드 자산**으로 두면 다시 만들 때 주소가 바뀌어 카카오 캐시를 피함 |
| `twitter:card` summary_large_image + image | ⬜ | OG 이미지와 함께 |
| **초대 링크 미리보기에 사진 안 나오게** | ✅ | `/invite/*`도 같은 `index.html`이라 랜딩 OG만 나옴(사진 노출 없음, [media-security.md](media-security.md) 2.6). OG 이미지를 넣어도 브랜드 이미지 한 장이라 그대로 안전 |

## 4. 본문이 스크립트 없이 보이게 (가장 큰 일)

| 항목 | 상태 | 메모 |
|---|---|---|
| **랜딩 본문을 정적 HTML로** | ⬜ | 지금은 JS 없이 빈 페이지. 방법 후보 ↓ |
| h1 하나, 제목 단계 | ✅(JS 실행 시) | 랜딩 h1 "흩어진 사진을, 한곳에." + 기능 h2 |
| `<main>`·`<footer>` | ⬜ | `footer`는 있고 **`<main>`이 없음** — 랜딩 본문을 `<main>`으로 |
| 이미지 alt | — | 랜딩에 사진 없음(셰이더 캔버스) |

**정적 랜딩 방법 후보**
- (a) 빌드 때 랜딩만 미리 그려 `index.html`의 `#root`에 넣기(React `renderToString` 또는 손으로 쓴 정적 마크업). `index.html`은 `/library` 같은 다른 화면에도 쓰이므로, 그 화면에서는 `theme-init.js`(이미 첫 페인트 전에 도는 스크립트)가 경로를 보고 정적 랜딩을 숨겨 깜빡임을 막음 — **제안**
- (b) 랜딩을 별도 정적 파일로 떼고 Worker가 `/`만 그 파일로 응답 — 깔끔하지만 라우팅 변경이 큼
- (c) 그대로 두기 — Google만 믿음. AI 답변 엔진·네이버에는 안 보임

## 5. GEO (AI 답변 엔진)와 문구

| 항목 | 상태 | 메모 |
|---|---|---|
| **랜딩 문구를 지금 방향에 맞게** | ⬜ | 지금 문구는 "PC 폴더 보기" 중심(MVP 시절). 지금 방향은 "한 명이 구독하면 가족이 함께 보고 올리는 비공개 앨범, 원본 보존, 광고 없음"([service-plan.md](service-plan.md)). AI가 인용하는 건 첫 문단 — 무엇·누구에게·왜 다른지를 한두 문장으로 |
| JSON-LD | ⬜ | 랜딩에 `WebSite` + `Organization`(운영자) — 앱 출시 뒤 `MobileApplication`(가격 정하면 `offers`). `<script type="application/ld+json">`은 실행되지 않는 데이터라 CSP와 무관 |
| `llms.txt` | ⬜ | nuvo가 무엇인지, 무료/구독 범위, 가격(정해지면), 개인정보 원칙(비공개 기본·위치 기본 제거·E2E 아님), 문서 링크. 정적 파일로 |
| Cloudflare AI 크롤러 차단 확인 | ⬜👤 | 새 계정에서 "Block AI bots"가 켜져 있으면 GEO가 안 됨. 랜딩만 노출이라 켜 두는 선택도 가능 — 정할 것 |
| FAQ 구간 | ⬜ | "구독 없이 가족이 볼 수 있나요?", "사진을 AI 학습에 쓰나요?", "해지하면?" 같은 질문·답을 랜딩에 — AI가 그대로 인용하기 좋음. 답은 ④ 약관과 가격 결정 뒤 |

## 6. 성능 (검색 순위에 영향)

| 항목 | 상태 | 메모 |
|---|---|---|
| 첫 JS 크기 | ⬜ | 앱 전체가 한 덩어리(`index-*.js` gzip 약 200KB)라 랜딩에서도 다 받음. 화면별로 나누기(라우트 `lazy`)로 랜딩 첫 로드를 줄임 |
| 랜딩 셰이더 | ✅ 일부 | 이미 지연 로드(`LandingField`·`react-three-fiber` 별도 청크), 저사양·reduced-motion 대체 화면 있음 |
| Lighthouse 모바일 측정 | ⬜ | 정적 랜딩·코드 나누기 전후로 |
| HTTPS 강제 | ⬜👤🌐 | Cloudflare "Always Use HTTPS" (포트폴리오 남은 일과 같음) |

## 7. 운영자 작업

| 항목 | 상태 |
|---|---|
| 도메인 결정·연결 | ⬜👤 ([developer-guide.md](developer-guide.md) 10단계) |
| Google Search Console·네이버 서치어드바이저·Bing 등록, sitemap 제출 | ⬜👤🌐 |
| 카카오·페이스북 공유 디버거로 OG 확인 | ⬜👤🌐 |
| Google 리치 결과 테스트·Schema Markup Validator로 JSON-LD 확인 | ⬜👤🌐 |
| Cloudflare AI 크롤러 설정 | ⬜👤 |

## 8. 모바일 앱 단계 (📱)

| 항목 | 메모 |
|---|---|
| `apple-itunes-app` 메타(사파리 앱 배너), Play 링크 | 앱 출시 뒤 |
| `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | 초대 링크(`/invite/*`)를 휴대폰에서 누르면 앱으로 열리게(유니버설 링크·앱 링크). 이 파일들은 noindex여도 상관없지만 `_headers`가 막지 않는지 확인 |
| `MobileApplication` JSON-LD | 스토어 주소·가격 |

## 자동 점검

포트폴리오의 `scripts/seo-check.mjs`처럼 빌드 결과를 읽는 점검을 nuvo에도 두는 것을 제안합니다. 검사 대상이 랜딩 한 장 + 공개 문서라 작습니다: title·description·파비콘·OG(이미지 파일 존재)·canonical(도메인 뒤)·JSON-LD 파싱·정적 본문에 h1 있음·robots·sitemap 일치·`_headers` noindex 규칙.

## 순서 제안

1. **도메인 없이 지금**: 파비콘·apple-touch-icon·매니페스트, OG 이미지·`og:site_name`·`og:locale`·twitter large, 정적 랜딩(4-a), 라우트 코드 나누기, JSON-LD·`llms.txt`(URL은 도메인 자리만), 점검 스크립트
2. **문구**: 랜딩 문구·FAQ를 지금 방향으로 — 가격·약관 결정과 함께
3. **도메인 뒤**: canonical·`og:url`·sitemap·robots Sitemap 줄, HTTPS 강제, 검색 콘솔 등록
4. **앱 뒤**: 앱 배너, 유니버설 링크·앱 링크, `MobileApplication`
