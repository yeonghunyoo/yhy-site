# nuvo SEO·GEO 체크리스트

2026-11-10 작성. 포트폴리오(site)의 SEO 점검 기준(`apps/site/docs/01-frontend.md` "SEO·GEO", `pnpm site seo:check`)을 nuvo에 맞춰 옮긴 것입니다.
상태 표시: ✅ 됨 / ⬜ 할 일 / 🌐 도메인이 있어야 함 / 👤 사람(운영자) 작업 / 📱 모바일 앱 단계.

**11/10 구현 (순서 1 "도메인 없이 지금")** — 빌드 플러그인 `seo/plugin.ts`가 랜딩 문구 한 곳(`src/pages/landing-copy.ts`)으로 `<head>` 메타·정적 랜딩·JSON-LD·robots·매니페스트·`llms.txt`를 만들고, 도메인은 빌드 환경변수 **`NUVO_SITE_URL`** 하나로 canonical·`og:url`·절대 이미지 주소·sitemap·robots의 Sitemap 줄이 켜집니다. 아이콘·OG 이미지는 `scripts/brand-assets.mjs`(원본 `public/favicon.svg`, `brand/og.html`), 점검은 `scripts/seo-check.mjs`. 랜딩 외 화면은 나눠 불러와 첫 JS가 gzip 약 200KB → 114KB. 확인: seo-check(도메인 있음·없음 둘 다), CSP 검사, JS 켠/끈 브라우저(켜면 React가 정적 랜딩을 갈아 끼워 h1 하나, 끄면 본문이 보임), 스모크·E2E

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
| robots.txt `Sitemap:` 줄 | ✅🌐 | 빌드 때 `NUVO_SITE_URL`이 있으면 자동 |
| `/terms`·`/privacy` 공개 + 색인 허용 | ⬜ | 페이지 자체가 ④ 약관 작업 대기. 생기면 `_headers`에서 noindex를 떼고 sitemap에 넣음 |
| `/account/delete`는 noindex 유지 | ✅ | 스토어 요건은 "열리는 주소"이지 색인이 아님 |
| sitemap.xml (`/` + 공개 문서) | ✅🌐 | 빌드 때 `NUVO_SITE_URL`이 있으면 생성. 공개 페이지 목록은 `seo/plugin.ts` `PUBLIC_PATHS` |

## 2. `<head>` 기본

| 항목 | 상태 | 메모 |
|---|---|---|
| `lang`·charset·viewport | ✅ | |
| title (15자) | ✅ | `nuvo · 가족 사진을 한곳에`. 포트폴리오 기준(ko 40자 이하) 안 |
| description (약 55자) | ✅ | 기준 40~120자 안. 아래 5번 문구 개편 때 같이 손봄 |
| 파비콘 | ✅ | `public/favicon.svg` (클레이 바탕에 n) |
| `apple-touch-icon` (180×180) | ✅ | `scripts/brand-assets.mjs`가 파비콘에서 찍음 |
| 웹 앱 매니페스트 | ✅ | 빌드 때 `manifest.webmanifest`(아이콘 192·512) |
| canonical | ✅🌐 | `NUVO_SITE_URL`이 있으면 |
| `theme-color`·`color-scheme` | ✅ | |

## 3. 공유 미리보기 (OG·Twitter)

| 항목 | 상태 | 메모 |
|---|---|---|
| `og:type`·`og:title`·`og:description` | ✅ | |
| `og:site_name`·`og:locale`(ko_KR) | ✅ | |
| `og:url` | ✅🌐 | canonical과 같게 |
| OG 이미지 (1200×630) | ✅ | `src/assets/og.png`(빌드 자산 — 다시 찍으면 주소가 바뀌어 카카오 캐시를 피함). 원본 `brand/og.html`, Pretendard로 찍음. 도메인이 있으면 절대 주소 |
| `twitter:card` summary_large_image + image | ✅ | |
| **초대 링크 미리보기에 사진 안 나오게** | ✅ | `/invite/*`도 같은 `index.html`이라 랜딩 OG만 나옴(사진 노출 없음, [media-security.md](media-security.md) 2.6). OG 이미지를 넣어도 브랜드 이미지 한 장이라 그대로 안전 |

## 4. 본문이 스크립트 없이 보이게 (가장 큰 일)

| 항목 | 상태 | 메모 |
|---|---|---|
| 랜딩 본문을 정적 HTML로 | ✅ | 방법 (a) — 아래. D-024 |
| h1 하나, 제목 단계 | ✅(JS 실행 시) | 랜딩 h1 "흩어진 사진을, 한곳에." + 기능 h2 |
| `<main>`·`<footer>` | ✅ | React 랜딩·정적 랜딩 둘 다 |
| 이미지 alt | — | 랜딩에 사진 없음(셰이더 캔버스) |

**정적 랜딩 방법 후보** (11/10: (a)로 구현)
- (a) 빌드 때 랜딩만 미리 그려 `index.html`의 `#root`에 넣기(React `renderToString` 또는 손으로 쓴 정적 마크업). `index.html`은 `/library` 같은 다른 화면에도 쓰이므로, 그 화면에서는 `theme-init.js`(이미 첫 페인트 전에 도는 스크립트)가 경로를 보고 정적 랜딩을 숨겨 깜빡임을 막음 — **제안**
- (b) 랜딩을 별도 정적 파일로 떼고 Worker가 `/`만 그 파일로 응답 — 깔끔하지만 라우팅 변경이 큼
- (c) 그대로 두기 — Google만 믿음. AI 답변 엔진·네이버에는 안 보임

## 5. GEO (AI 답변 엔진)와 문구

| 항목 | 상태 | 메모 |
|---|---|---|
| **랜딩 문구를 지금 방향에 맞게** | ⬜ | 지금 문구는 "PC 폴더 보기" 중심(MVP 시절). 지금 방향은 "한 명이 구독하면 가족이 함께 보고 올리는 비공개 앨범, 원본 보존, 광고 없음"([service-plan.md](service-plan.md)). AI가 인용하는 건 첫 문단 — 무엇·누구에게·왜 다른지를 한두 문장으로 |
| JSON-LD | ✅ | `WebSite` + `Organization`(도메인이 있으면 `@id`·url·logo). CSP 검사 통과. 앱 출시 뒤 `MobileApplication`(가격 정하면 `offers`) |
| `llms.txt` | ✅ | 빌드 때 생성 — 무엇을 하는지, 원칙(비공개 기본·원본 보관·위치 기본 비공유·구독 10GB·가족은 구독 없이), 링크. 가격은 정해지면 |
| Cloudflare AI 크롤러 차단 확인 | ⬜👤 | 새 계정에서 "Block AI bots"가 켜져 있으면 GEO가 안 됨. 랜딩만 노출이라 켜 두는 선택도 가능 — 정할 것 |
| FAQ 구간 | ⬜ | "구독 없이 가족이 볼 수 있나요?", "사진을 AI 학습에 쓰나요?", "해지하면?" 같은 질문·답을 랜딩에 — AI가 그대로 인용하기 좋음. 답은 ④ 약관과 가격 결정 뒤 |

## 6. 성능 (검색 순위에 영향)

| 항목 | 상태 | 메모 |
|---|---|---|
| 첫 JS 크기 | ✅ | 랜딩 외 화면을 `lazy`로 — `index-*.js` gzip 약 200KB → 114KB. 나머지는 React·라우터·쿼리·인증 클라이언트 |
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

## 자동 점검 (11/10)

`node apps/nuvo/scripts/seo-check.mjs` — 빌드 결과(`dist/client`)를 읽는다. 오류: charset 위치·lang·viewport·title·description·파비콘·apple-touch-icon·매니페스트(아이콘 파일), OG·Twitter 태그 없음·중복·이미지 파일 없음, (도메인 있음) canonical·`og:url`·절대 이미지 주소·sitemap·robots Sitemap 줄, JSON-LD 파싱, 정적 랜딩 h1 하나·`<main>`·본문 있음·다른 화면 숨김 규칙, img alt, robots가 랜딩 허용, `_headers` noindex 규칙. 경고: title·description 길이, 도메인 없이 빌드. 도메인을 넣은 빌드는 같은 `NUVO_SITE_URL`로 점검

## 순서 제안

1. **도메인 없이 지금**: 파비콘·apple-touch-icon·매니페스트, OG 이미지·`og:site_name`·`og:locale`·twitter large, 정적 랜딩(4-a), 라우트 코드 나누기, JSON-LD·`llms.txt`(URL은 도메인 자리만), 점검 스크립트
2. **문구**: 랜딩 문구·FAQ를 지금 방향으로 — 가격·약관 결정과 함께
3. **도메인 뒤**: canonical·`og:url`·sitemap·robots Sitemap 줄, HTTPS 강제, 검색 콘솔 등록
4. **앱 뒤**: 앱 배너, 유니버설 링크·앱 링크, `MobileApplication`
