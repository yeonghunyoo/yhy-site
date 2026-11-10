# 작업 할 일 — portfolio-web

2026-11-06 작성. 단계 문서·가이드에 흩어져 있던 미완료 항목을 한곳에 모은 목록이다. 세부 절차와 이유는 링크한 문서에 있고, 결정 이유는 [decisions.md](decisions.md).

- 끝내면 `[x]`와 날짜를 붙이고, 원래 문서(링크)에도 같은 체크를 한다
- "사람"은 Claude가 할 수 없고 사용자가 해야 하는 일(계정·대시보드·실기기·콘텐츠 결정), "코드"는 바로 구현할 수 있는 일
- 배포(`pnpm site deploy`)와 운영에 쓰는 명령(`rag:*:remote`, `rag:reindex:api`)은 사용자가 요청할 때만 한다

## 상태 (11/10)

| 단계 | 상태 |
|---|---|
| 0–4 MVP (인프라·프론트·인증·레터·어드민) | 코드 완료. `https://bettercurl.dev` 운영 중(11/04 커스텀 도메인, 예전 workers.dev 주소는 301 — 11/10 배포). 어드민 화면 5개(지표·레터·사용자·챗 로그·사용량) 완료. **메일 경로·어드민 운영 확인이 남음** |
| 홈 개편 | 11/05 3D 픽셀 히어로(임시 흉상) + 본문 S-010 + 썸네일 S-011 + 제목 글꼴 Quantico S-012 + 챗 바 |
| SEO·GEO | **코드 완료·운영 반영(11/10 `e9f3ee09`)**: `<head>`·robots·sitemap·OG(해시 주소)·JSON-LD·`llms.txt`·끝 슬래시 301·apple-touch-icon, 배포 전 자동 점검(S-015). Lighthouse 모바일 홈 89~92·프로젝트 100, SEO 100. **남은 것은 사람 작업**: 검색엔진 등록, Always Use HTTPS, Web Analytics 결정, 홈 description |
| 8 블로그 | 11/10 범위에 넣음(S-017). 설계 [08-blog.md](08-blog.md), Notion "블로그 글" DB 만듦. **코드 완료(11/10, 로컬 R2로 확인), 배포 전** — Notion 통합 토큰·첫 글이 필요 |
| 5–6 챗+RAG | 운영에 켜짐(11/03 테스트 기간). 운영 청크 247 = 벡터 247, 기준 질문 58개 경로·재현율 100%(11/04). **완료 기준 확인 전** |
| 7 3D | 히어로로 앞당겨 반영. 실제 얼굴 스캔 모델은 후순위 |

## 남은 일

**11/10 우선순위**(사람 작업, 위에서부터): ① Google Search Console·네이버·Bing 등록 + sitemap 제출(B) ② Cloudflare Always Use HTTPS·Block AI bots 확인(B) ③ Web Analytics 쓸지·홈 description 문구(D) ④ 메일 경로·어드민 운영 확인(C) ⑤ 실기기 2대(C) ⑥ 리치 결과 테스트·카카오 공유 디버거(C) ⑦ 분석 토큰(B) ⑧ 블로그: Notion 통합 토큰 발급·DB 공유(B) → 구현(A)

### A. 지금 바로 할 수 있는 코드
- [x] **JSON-LD·`llms.txt`**(11/09, 배포 전) — 홈 `Person`+`WebSite`, 프로젝트 상세 `CreativeWork`, `src/pages/llms.txt.ts`(projects 컬렉션 + `src/data/career.ts`). [01-frontend.md](01-frontend.md) "SEO·GEO". 배포 뒤 리치 결과 테스트로 확인
- [ ] **챗 기준 질문 보강** — `eval.json`에 영어 포트폴리오 3, 칩 질문 3, 포트폴리오인데 문서에 없는 질문 4. [chat-rag-setup.md](guides/chat-rag-setup.md) "보강"
- [ ] **근거 판단 기준 다시 재기** — 포트폴리오 경로 질문만으로 범위 안 최저 / 근거 없음 최고. 안 겹치면 0.42 유지, 겹치면 키워드 보조 규칙을 05-06에 먼저 적고 구현
- [ ] **공격 질문 점검 다시(로컬)** — `redteam.json` 13개를 슈퍼바이저가 들어간 지금 구조로. 11/01 12/12는 슈퍼바이저 전 결과
- [ ] **챗 완료 기준 문구 고치기** — "범위 밖은 모델 호출 없이 거절" → "무관 작업은 슈퍼바이저 1회 뒤, 근거 없음은 검색 뒤 답변 호출 없이 거절". [05-06-chat-rag.md](05-06-chat-rag.md) "완료 기준"과 chat-rag-setup "3. 확인"
- [ ] **추천 칩·인사말 다듬기** — 지금 칩은 일반 질문 3개("어떤 프로젝트를…"). 문서로 확실히 답이 나오는 질문으로 바꿀 안을 만들어 확인받는다. 바꾸면 칩마다 로컬에서 답·출처 칩 확인, 페르소나를 건드리면 `?redteam=1`. chat-rag-setup 2-3
- [ ] **답변 모델 다시 비교**(칩·기준 질문 뒤) — 실제 문서로 Gemma 4 vs Qwen3 14문항, 05-06 "모델 비교"에 표 추가. chat-rag-setup 3
- [x] **404 화면의 언어 전환 링크**(11/10) — 다른 언어판이 없으면(404·한 언어뿐인 블로그 글) 그 언어 홈으로. `BaseLayout`이 hreflang 대응에서 정해 `Header`에 넘긴다
- [ ] **`CF_ACCOUNT_ID`를 `wrangler.jsonc` `vars`로**(정하면) — 계정 ID는 비밀이 아니라 코드에 두면 운영자가 넣을 비밀이 토큰 하나로 준다. 운영에 같은 이름 비밀이 이미 있으면 지우고 옮긴다(이름이 겹치면 배포가 막힌다)
- [x] **블로그 목록 숨김 글**(11/10) — 주소로만 열리는 미리보기(`unlisted`, Notion 선택 속성 `목록 숨김`). 운영에서 단계형 화면을 보려고 시험 글 두 편을 목록 숨김으로 올림
- [x] **블로그 글 화면(Vercel식)·단계형 코드(Clerk식)**(11/10, S-020) — Notion 2열 블록 = 한 단계, 탭 = 코드 이름표, 문법 색·줄 번호·복사. 로컬 확인. Notion 비공개 예시 글 "작성 예시 — 단계별 코드 설명"
- [x] **블로그 자동 동기화·자리표시 컴포넌트**(11/10, S-018·S-019) — `.github/workflows/blog-sync.yml`, `@component` → 허용 목록 컴포넌트(`pixel-bust`·`scramble`), 시험 21개
- [x] **블로그 구현**(11/10, [08-blog.md](08-blog.md) "구현") — 동기화·변환(시험 18개)·R2 읽기·목록/글/사진/sitemap·엣지 캐시·`BlogPosting`·`seo-check --url`. 로컬 R2로 확인. 운영은 토큰·첫 글 뒤 08-blog "운영 순서"
- [ ] **과정 보기 구현**(D의 공개 범위를 정한 뒤) — SSE `step` 이벤트 + 답 위 진행 줄·접힌 요약. chat-rag-setup 5

### B. 사람 작업이 먼저인 것
- [ ] **콘텐츠 다듬기** — 인트로 문구·프로젝트 본문(`src/i18n/*.json`, `src/content/projects/`), 프로젝트 본문 첫 문단에 무엇·왜·결과. [mvp-launch.md](guides/mvp-launch.md) "공개 전"
- [ ] **개인정보처리방침 초안 확인** — `src/pages/[locale]/privacy.astro`
- [ ] **프로젝트 썸네일 이미지** — Forest 말고 3개는 빈 칸(S-011). 이미지를 주면 갤러리 첫 장으로 넣는다
- [ ] **히어로 실제 얼굴 3D 스캔** — 받으면 코드: `createHero`에 `modelUrl`, CSP `script-src`에 `'wasm-unsafe-eval'`(Meshopt), 포스터·OG 다시. [3d-hero.md](guides/3d-hero.md)
- [ ] **Resend 대시보드** — `mail.bettercurl.dev` Open·Click Tracking 끄기, 루트 `bettercurl.dev`를 Resend에서 지울지(지우면 DNS 레코드도 정리). [domain-setup.md](guides/domain-setup.md) "Resend 점검"
- [ ] **Cloudflare 대시보드 설정**([cost-guard.md](guides/cost-guard.md) 5) — 한 기록이 없다. 이미 했으면 체크만
  - [ ] 분석 읽기 토큰 → `CF_ANALYTICS_TOKEN`·`CF_ACCOUNT_ID` 비밀(없으면 `/admin/usage`에 Cloudflare 칸이 빈다). 자동 발급은 하지 않는다 — API로 만들려면 "토큰을 만드는 토큰"(API Tokens: Edit)이 먼저 있어야 해 읽기 토큰보다 위험하다. 대시보드에서 `Account Analytics : Read` 하나만(11/10, cost-guard 5-1)
  - [ ] 결제 알림, Workers 사용량 알림
  - [ ] WAF 속도 제한 규칙(`/api/` IP당 10초 20회), Bot Fight Mode — 도메인이 붙었으니 이제 가능
- [ ] **Cloudflare Always Use HTTPS** — SSL/TLS → Edge Certificates. 지금 http로 오면 200(11/09 점검)
- [ ] **검색 노출(운영자)** — 네이버 서치어드바이저도(11/09 체크리스트). AI 크롤러 차단(Block AI bots) 꺼져 있는지 확인, Google Search Console·Bing Webmaster Tools 등록 + sitemap 제출. [01-frontend.md](01-frontend.md) "운영자가 할 일". 11/09 밖에서 점검: 운영 `robots.txt`에 Cloudflare가 덧붙인 내용 없음(관리형 robots.txt 꺼짐), GPTBot·ClaudeBot·PerplexityBot·Googlebot·bingbot 이름으로 요청하면 200(이름만 바꾼 요청이라 Block AI bots 꺼짐의 확정은 아님 — 대시보드에서 확인), DNS TXT에 `google-site-verification` 없음 → Search Console은 아직 미등록으로 보인다. 등록은 "도메인" 속성 + Cloudflare DNS TXT가 간단
- [ ] **블로그 키 → GitHub Secrets**(S-018) — ① Notion: notion.so/profile/integrations에서 내부 통합(콘텐츠 읽기만) → "bettercurl 블로그" 페이지 ⋯ → 연결에 추가(이 페이지·DB만) ② Cloudflare: API 토큰 새로(권한 "Workers R2 Storage: Edit" 하나, 이 계정만) ③ GitHub 저장소 Settings → Secrets and variables → Actions: `NOTION_TOKEN`·`BLOG_R2_TOKEN`·`CLOUDFLARE_ACCOUNT_ID`. 자동 주기는 Variables에 `BLOG_SYNC` = `on`. [08-blog.md](08-blog.md) "자동 동기화"
- [ ] **첫 글** — Notion "🧪 핸드오프 실험"을 "블로그 글" DB로 옮기거나 복제(slug `handoff-experiment`, 요약, 발행일, 공개 체크). 사진은 장당 5MB 이하(Notion 무료)
- [ ] **블로그 운영 시작**(키·첫 글 뒤) — 배포 → Actions blog-sync 수동 실행(로그에서 동기화·SEO 점검 확인) → `BLOG_SYNC=on` → Search Console에 `/sitemap-blog.xml` 제출, 리치 결과 테스트(`BlogPosting`). [08-blog.md](08-blog.md) "운영 순서"·"완료 기준"
- [ ] **Turnstile 키 발급**(선택) — 받으면 코드: 레터·챗 봇 검사, CSP에 `challenges.cloudflare.com`. cost-guard "다음 단계"

### C. 운영 배포와 배포 뒤 확인
- [x] **배포** — 11/10 `7474b086`(`main` 1f2ebc2: 블로그 글 단 왼쪽 기준선, 그림·북마크 변환). SEO 점검 오류 0
- [x] **배포** — 11/10 `dabbc785`(`main` d5fc8e6까지: 8 블로그 코드 S-017~S-020·목록 숨김). SEO 점검 오류 0. 블로그 목록은 비어 있음("아직 글이 없어요") — 시험 글 두 편(`/ko/blog/steps-example/`, `/ko/blog/fixture-test/`)만 목록 숨김·noindex로 운영 R2에. 실제 글이 생기면 시험 글은 Notion 동기화가 index를 새로 쓰며 빠진다
- [x] **배포** — 11/10 `e9f3ee09`(클라우드 세션, `main` f1d8fb0까지: S-014 workers.dev 301, JSON-LD·`llms.txt`, S-015 SEO 후속·3D 늦은 시작). 배포 스크립트의 SEO 점검 통과(오류 0, 경고 1 — 홈 description 길이). 비밀값 그대로, RAG 동기화 건너뜀
- [x] **배포** — 11/06 `8052616d`(클라우드 세션, `main` aebb9e7까지: 11/05 홈 개편·챗 바·Quantico, 11/06 스냅 잠금·드래그 막기·눈 숫자·히어로 문구 S-013). 비밀값은 그대로(`.prod.vars` 없음), RAG 동기화는 건너뜀
- [ ] **메일 경로**([resend-setup.md](guides/resend-setup.md) "확인", [domain-setup.md](guides/domain-setup.md) "확인")
  - [ ] 로그인 없이 레터 → `letters@bettercurl.dev` → 개인 메일 도착 + Telegram 📮, 답장 누르면 방문자 주소
  - [ ] 어드민 답장 → 방문자 주소 도착(Resend Delivered)
  - [ ] 관리자 이메일 로그인(매직링크·코드), 같은 링크 재사용 시 안내, `/en`에서 요청하면 영어 메일
  - [ ] Gmail 원본 보기에서 SPF·DKIM·DMARC `PASS`
- [ ] **어드민** — 지표·레터 답장·사용자 차단, 로그인한 비관리자는 "권한 없음"·`/api/admin/*` 404. [mvp-launch.md](guides/mvp-launch.md) 5
- [ ] **챗 완료 기준**(운영, chat-rag-setup 4) — 하루 20턴 제한, 월 토큰 상한 + Telegram 🧯, 출처 칩 → 섹션 이동, "오늘 날씨" 거절(답변 토큰 0), `/admin/chat?redteam=1` 전부 통과, 질문 로그(답변 본문 없음)
- [ ] **챗 내용 확인** — "연락처 알려줘" → `hello@bettercurl.dev`(개인 Gmail이 나오면 RAG 운영 반영이 안 된 것), "What did you do at holich?" 재현
- [ ] **운영 `/media`** — Forest 이미지 200, 지운 PDF 404. [06-ingest.md](06-ingest.md) 구현 메모
- [ ] **실기기 2대(iOS Safari, Android Chrome)** — 레이아웃, 3D 히어로 성능(11/10부터 로드 뒤 한가할 때 시작 — 포스터가 너무 오래 보이지 않는지, 스크롤이 매끄러운지), 아이폰 홈 화면 아이콘, 챗 키보드에 입력창이 보이는지, 챗 시트·흐름도 터치 4건("실기기 재확인 필요", [browser-support.md](guides/browser-support.md))
- [ ] **Lighthouse 모바일 90+** — 3D 히어로를 넣은 뒤 다시 잰다. [01-frontend.md](01-frontend.md) "완료 기준". 11/09 운영(11/06 배포본) 홈 78(TBT 930ms)·프로젝트 상세 100 → 3D 시작 순서를 고쳤다(S-015). **11/10 배포 뒤 홈 89~92(3회, TBT 310~400ms, LCP 1.5s, CLS 0)·프로젝트 상세 100**. 남은 TBT는 WebGL 컨텍스트 생성. 실기기 확인이 남음
- [x] **11/09 SEO 후속 배포 뒤 확인**(11/10) — `/ko`·`/en/privacy`·`/ko/projects/nuvo` → 301 슬래시(쿼리 유지), workers.dev → 301 도메인(POST 308), `og:image` `/_astro/og.CXa257X_.png` 200, `/apple-touch-icon.png`·`/llms.txt` 200, 없는 주소 404, JSON-LD 들어감
- [ ] **리치 결과 테스트·카카오 공유 디버거**(사람) — search.google.com/test/rich-results에 홈·프로젝트 주소, 카카오에서 새 OG 이미지

### D. 정해야 할 것
- [ ] 챗 고정 답변(연락·무관 작업·근거 없음)을 하루 20턴에서 뺄지
- [ ] 연락 에이전트가 대화로 레터 초안을 채울지 (05-06 "정하지 않은 것")
- [ ] 과정 보기를 모든 방문자에게 보일지, 접힌 요약까지만 보일지 (A 과정 보기의 전제)
- [ ] 이력서 자동 발송(레터로 요청하면 문서를 보냄) — 만들면 메일 상한·봇 방지와 함께 설계, FAQ "이력서" 답 변경
- [x] workers.dev 주소를 다시 켤지 → 켜고 도메인으로 301(11/07, S-014). 배포해야 반영
- [ ] Cloudflare Web Analytics 쓸지, 변경 이력을 git에서 자동 생성할지 (overview "2차 디테일"). 11/09: 대시보드에서 이미 켜져 비콘이 자동으로 붙는데 CSP가 막는다(콘솔 오류, 수집 0) — 쓰면 CSP 허용, 안 쓰면 끈다
- [ ] 홈 description 문구 — 지금 36자, 권장 40~120자(`seo:check` 경고). [01-frontend.md](01-frontend.md) "11/09 SEO 체크리스트 점검"
- [ ] 홈 프로젝트 목록의 흐린 항목 대비 — 화면 가운데가 아닌 프로젝트를 흐리게 해서 Lighthouse 접근성 96(대비 부족). 디자인 의도라 둘지, 흐림을 줄일지(S-010)
- [x] **블로그(Notion CMS)를 범위에 넣을지** → 넣음, Notion에서 쓰고 동기화가 R2 `blog/`로, 사이트는 요청 때 읽기(11/10, S-017)
- [ ] Notion "프로젝트 갤러리"의 회사 프로젝트(Let's Bee·MyCONECT·모두맘, 개인 Aquanote)를 사이트 프로젝트 페이지로 낼지 — 지금은 경력·RAG(이력서)에만 있다. 내면 무엇·왜·결과와 이미지가 필요

### E. 때가 되면 (2차·선택)
- [ ] WAF 국가별·봇 점수 챌린지, `/api/chat` WAF 속도 제한 ([common.md](common.md), 선택)
- [ ] RAG 2차: 스캔 쪽 OCR·이미지 설명, docx·html 파서, `rag:media:gc`, 다국어 리랭커 재측정, 프로젝트 안내 에이전트, MMR. 재현율이 0.8 아래로 떨어지면 예상 질문 생성
- [ ] Telegram 봇 표시 이름·사진(`/setname`·`/setuserpic`)
- [ ] 보조 도메인 `yeonghun.dev` (S-005, 사지 않기로 했지만 나중에 가능)
- [ ] 검색엔진 등록 2~4주 뒤 — Search Console 색인 현황("크롤링됨 - 색인 안 됨" 원인), 검색어·노출·CTR로 title·description 손보기
- [ ] JSON-LD `BreadcrumbList`(홈 > 프로젝트) — 선택, 프로젝트 목록 페이지가 생기면

### F. 문서 정리 (기록이 코드·결정보다 뒤처진 곳)
설계와 어긋난 문서를 고치자는 제안이다. 고쳐도 되면 한 번에 정리한다.
- [ ] [mvp-launch.md](guides/mvp-launch.md) "막혀 있는 것" — 도메인 전 기준(11/04 이후 도메인·Resend·Google 해결)
- [ ] [01-frontend.md](01-frontend.md) "홈 개편안(제안, S-007)" — S-009·S-010으로 다른 안이 구현됨. decisions에 S-007을 닫는 항목, 섹션은 기록용 표시. 같은 문서의 "미결: OG 이미지 방식"은 정적 한 장으로 끝남
- [ ] [3d-hero.md](guides/3d-hero.md) "남은 결정" — 스토리 장·천칭은 S-008(변호사 컨셉) 시절 항목, S-009에서 컨셉 라벨을 쓰지 않기로 해 남길지 정리
- [ ] [chat-rag-setup.md](guides/chat-rag-setup.md) "1. 운영 벡터 맞추기" — 11/04 `rag:reindex:api`로 247 = 247이 됨. 남은 것은 `RAG_SYNC_TOKEN` 등록 여부(배포 뒤 자동 동기화용)뿐
- [ ] [overview.md](overview.md) "2차 디테일" SEO 행, `apps/site/CLAUDE.md` "아직 미정"(브랜드·도메인·메일은 11/04 정해짐)
