# portfolio-web 결정 기록

프로젝트의 **왜**를 남기는 문서다. 무엇을 정했는지뿐 아니라 어떤 선택지를 봤고, 무엇을 버렸고, 무엇을 근거로 했는지를 적는다. 규칙은 루트 `CLAUDE.md`와 같다.

- 결정·잠정·제안이 생기거나 바뀔 때마다 **위에 덧붙인다**. 지우지 않고, 뒤집히면 새 항목에서 "S-00N을 뒤집음"이라고 쓴다
- 한 항목 = 날짜 · 상태(확정/잠정/제안) · 결정 · 본 선택지 · 이유 · 자료 · 관련 문서
- 세부 수치·표는 설계 문서에 두고 여기서는 링크한다. 제품·정책·구조·돈에 관한 것만 적는다
- 이 문서를 만들기 전(10/28~11/03)의 결정은 [overview.md](overview.md) "확정된 결정 사항" 표에 있다

상태: **확정** = 그대로 진행 / **잠정** = 이 기준으로 진행하되 바뀔 수 있음 / **제안** = 기본값일 뿐 아직 결정 아님

---

## 2026-11-10

### S-019 · 확정 · 블로그 자리표시 컴포넌트 — Notion에는 이름만, 코드는 레포의 허용 목록
- 결정: Notion 글에 코드 블록 `@component <이름> {JSON}`을 두면 동기화가 빈 자리(`<div data-blog-component>`)와 대체 글로 바꾸고, 글 페이지가 화면에 들어올 때 레포의 `src/components/blog/<이름>.ts`를 늦게 불러 붙인다. 이름은 `src/components/blog/components.json` 허용 목록에 있는 것만. 예시 `pixel-bust`(히어로 3D 장면 재사용)·`scramble`(글자 해독 효과)
- 본 것: react-notion-x(비공식 Notion API·인라인 style이 CSP와 충돌·요청 때 React 렌더라 무료 Worker CPU 10ms에 걸림·Notion 모양 디자인) / Notion에 HTML·JS를 직접 넣기(Notion 계정이 털리면 사이트에 스크립트를 심을 수 있다, CSP 위반) / **허용 목록 컴포넌트(채택)**
- 이유: 사용자 요청(11/10) — "노션 데이터에 플레이스홀더를 두고 CSS·HTML 애니메이션이나 three.js를 넣기". 코드는 git에 버전이 남고 CSP 그대로, 자리가 없는 글은 JS 0
- 문서: [08-blog.md](08-blog.md) "자리표시 컴포넌트"

### S-018 · 확정 · 블로그 동기화는 GitHub Actions에서(30분마다 + 수동), 키는 GitHub Secrets
- 결정: `.github/workflows/blog-sync.yml`이 `pnpm blog:sync`를 돌린다. 수동 실행(workflow_dispatch)은 늘, 30분 주기는 저장소 변수 `BLOG_SYNC=on`일 때만. 키는 저장소 Secrets — `NOTION_TOKEN`(읽기 전용 통합), `BLOG_R2_TOKEN`(R2 쓰기만 되는 Cloudflare 토큰), `CLOUDFLARE_ACCOUNT_ID`. 바뀐 게 있으면 같은 작업에서 `seo:check --url`
- 본 것: 개발 환경(클라우드 세션·로컬)에서 사람이 돌리기 — 운영이 개발 환경에 기댄다(사용자 지적 11/10) / Worker Cron·어드민 버튼(Worker 비밀) — 무료 플랜이면 요청당 CPU 10ms라 변환·사진 처리가 안 들어가고 sharp가 Worker에서 안 돈다, 계정 플랜은 API로 확인 안 됨 / **GitHub Actions(채택)** — 스크립트 그대로, CPU 제한 없음, 공개 레포라 무료
- 배포 규칙과의 관계: 코드 배포는 그대로 로컬 `pnpm site deploy`만. 이 작업은 글·사진을 R2에 쓰는 **발행**이라 Worker 코드를 바꾸지 않는다
- 주의: 공개 레포의 예약 실행은 60일 동안 레포 활동이 없으면 GitHub가 멈춘다 — 그때는 Actions 화면에서 다시 켠다
- 문서: [08-blog.md](08-blog.md) "자동 동기화"

### S-017 · 확정 · 블로그 — Notion에서 쓰고, 동기화가 R2 `blog/`로 옮기고, 사이트는 요청 때 읽는다 (S-016 제안을 확정·수정)
- 결정: 블로그를 범위에 넣는다(overview "비범위"에서 뺌, 8단계). Notion "블로그 글" DB(공개 체크만) → `pnpm site blog:sync`가 글을 HTML로 정리하고 사진을 webp로 R2 `blog/`에 저장 → Worker가 요청 때 R2에서 읽어 그리고 엣지에 캐시. 글 페이지·블로그 sitemap은 SSR, 머리·메타·JSON-LD는 정적 페이지와 같은 `BaseLayout`
- 본 것: S-016 A 빌드 때 Notion에서 가져오기(사진이 Notion 서명 주소라 만료 — 결국 복사 필요, 글마다 전체 배포) / A' 빌드 때 R2에서 읽기(SEO 점검·정적 성능은 가장 좋지만 글마다 배포) / B 요청 때 Notion 직접(API 한도·장애가 사이트로) / **요청 때 R2(채택)**
- 이유: 사용자 의견(11/10) — "Notion DB 자체를 데이터로 쓰면 사진이 문제, 포폴 R2에 경로를 따로 두고 CMS용 데이터로 저장", "SEO는 적용하고 싶지만 글 때문에 전체 배포를 돌리는 건 과하다". R2는 이미 RAG 원본·이미지 저장소로 쓰고 있어(`sources/`·`media/`) 같은 버킷에 경로만 더한다
- 대가: 블로그 페이지는 빌드 때 SEO 점검 밖 → 동기화 전(원고 점검)·후(운영 주소 `seo-check --url`)에 점검. sitemap은 블로그 전용(`/sitemap-blog.xml`)을 따로 두고 robots.txt에 둘 다. 사진은 R2에서 나가므로 내용 해시 이름 + 영구 캐시
- Notion: 비공개 페이지 "bettercurl 블로그" 안에 DB "블로그 글"을 만듦(11/10, `collection://2fead265-afa2-40ab-ac6a-54e1ffabcb75`). 통합 토큰은 이 DB에만 공유
- 문서: [08-blog.md](08-blog.md)

### S-016 · 제안 · Notion을 CMS로 쓰는 블로그
- 제안: 사용자의 "다음 추진" 목록(어드민 · Notion CMS 블로그 · SEO/검색 등록) 중 블로그. 지금은 [overview.md](overview.md)에서 **비범위**("블로그, 댓글…")라 아무 코드·설계도 없다. 넣기로 하면 범위 결정 → 설계 문서 → 구현 순서
- 11/10 Notion 확인(연결된 워크스페이스 검색): 블로그용 데이터베이스·글은 없다. "다음 추진" 메모도 Notion에서는 찾지 못했다. 있는 것은 노션 포트폴리오 v1(25/12)·v2(26/08), 이력서 페이지, "프로젝트 갤러리" DB(이름·기간·스킬·설명 — Let's Bee 2건, MyCONECT, 모두맘, 개인 Aquanote). 사이트 프로젝트(handoff-agent·Forest·nuvo·이 포트폴리오)와 겹치지 않는다
- 본 선택지
  - A 빌드 때 Notion API로 가져와 content collection으로(Astro 로더). 글 발행 = 다시 빌드·배포. 정적 HTML이라 SEO·`seo:check`·sitemap이 그대로 맞는다. 토큰은 빌드하는 곳에만
  - B 요청 때 Worker가 가져와 KV·D1에 캐시. 배포 없이 발행되지만 Notion API 한도(초당 약 3회)·캐시 무효화·SSR 비용이 생기고 정적 점검 밖이다
  - C Notion에서 마크다운으로 내보내 레포에 커밋(지금 RAG 넣기와 같은 방식). 코드는 가장 적지만 손이 간다
- 기본안: A(정적 사이트·SEO 점검과 맞는다). 결정 전 확인할 것
  - Notion 파일 이미지 주소는 서명돼 약 1시간 뒤 만료 — 빌드 때 받아 빌드 자산으로 두거나 R2에 복사(R2면 `/media/*` 경로라 크롤러 비용 — SEO 규칙상 빌드 자산 권장)
  - 공개할 글만: DB에 "공개" 체크박스·slug·언어(ko/en)·요약 속성을 두고 그것만 가져온다. 노션 포트폴리오 페이지에는 전화번호·생년월일·예전 GitHub 주소가 있어 그대로 가져오면 안 된다
  - 글 구조화 데이터 `BlogPosting`, sitemap·`llms.txt`에 글 추가, 한/영 중 한 언어만 있는 글은 hreflang에서 뺀다(지금 프로젝트와 같은 규칙)
  - 빌드에 Notion 토큰이 필요해진다 — 루트 `pnpm build`가 토큰 없는 곳(클라우드 세션)에서도 통과하게, 토큰이 없으면 블로그만 빈 채로 빌드
- 11/10 기술 확인(사용자 요청 "지금 확인")
  - 이 환경에서 `api.notion.com`에 닿는다(토큰 없이 401). JS SDK `@notionhq/client` 5.31(11/06 갱신)
  - Notion API에 페이지를 마크다운으로 주는 엔드포인트가 있다: `GET /v1/pages/{id}/markdown`(`Notion-Version: 2026-03-11`, `markdown_version=v2` = Notion식 마크다운). 블록 트리를 직접 돌 필요가 없다. 약 2만 블록 넘으면 `truncated`, 못 읽은 블록은 `unknown_block_ids`. 공식 문서에 내부 통합(토큰) 제한은 없다
  - Notion식 마크다운은 표준이 아니다 — `<callout>`·`<columns>`·`<image source>`(캡션 포함)·`<b>`·`<code>`·`<p />`가 섞인다. 이 태그들을 HTML로 바꾸는 작은 변환기가 필요하다(Astro 로더의 `renderMarkdown`으로 나머지를 그린다)
  - 파일 이미지 주소는 1시간 뒤 만료 → 빌드 때 내려받아 빌드 자산으로(필수)
  - 토큰: Notion "내부 통합"을 만들어 블로그 DB에만 공유. 클라우드 세션에서는 환경의 네트워크 비밀(`api.notion.com` 헤더 주입)로 두면 코드·레포에 토큰이 없다. 로컬은 `apps/site/.env`
  - 글 후보: "🧪 핸드오프 실험 — 정제 파이프라인 vs 원본 HTML 직행 (iOS)"(26/09, 표 2개·이미지 4장·결론까지 있어 바로 글이 된다, handoff-agent 프로젝트와 연결). "웹 개발 공부"·"프로토타입 킷 개발"은 메모 수준. "Tripade Proj"(회사 작업 보드·패치노트)는 공개하면 안 된다 — 블로그는 전용 DB의 "공개" 글만 읽어야 하는 이유
- 상태: 제안 → 11/10 S-017로 확정(요청 때 R2에서 읽는 방식으로 수정)

## 2026-11-09

### S-015 · 확정 · SEO 체크리스트 후속 — 끝 슬래시 301, OG 이미지 해시 주소, 배포 전 SEO 자동 점검, 3D 히어로 늦은 시작
- 결정
  - 끝 슬래시 없는 언어 페이지(`/ko`, `/en/privacy`)는 Worker(`src/lib/redirects.ts`)가 301로 붙인 주소에 보낸다. workers.dev 301(S-014)도 같은 함수에서 슬래시까지 붙여 한 번에
  - OG 이미지는 `public/og.png` 고정 주소 대신 빌드 자산(`src/assets/og.png` → `/_astro/og.<해시>.png`)
  - `scripts/seo-check.mjs`를 배포 스크립트에 넣어 빌드 HTML에 SEO 오류가 있으면 배포를 멈춘다(경고는 통과)
  - 홈 3D 히어로는 페이지 로드 뒤 한가할 때 시작하고, 셰이더는 첫 그리기 전에 비동기로 미리 컴파일한다
  - 그 밖: 개인정보처리방침 고유 description, apple-touch-icon, 프로젝트 상세 첫 이미지 `fetchpriority="high"`
- 본 것
  - 슬래시: 그대로 307(정적 자산 기본 — 검색엔진엔 임시 이동) / `_redirects` 파일(페이지 경로는 `run_worker_first`로 Worker가 먼저 받아 적용 여부가 불확실) / Worker에서 301(채택, 로컬 `wrangler dev`로 확인)
  - OG: 파일명 손으로 올리기(`og-v2.png`, 잊기 쉽다) / 쿼리 `?v=`(캐시가 쿼리를 무시하는 곳이 있다) / 빌드 해시(채택, 내용이 바뀔 때만 주소가 바뀐다)
  - 점검: 빌드에 넣기(루트 `pnpm build`가 막혀 다른 앱 작업까지 멈춘다) / CI(배포가 로컬 wrangler라 CI가 없다) / 배포 스크립트(채택)
  - 3D: 첫 스크롤 때 시작(점수는 가장 좋지만 맨 위에서 눈 숫자가 안 움직인다) / 웹 워커 OffscreenCanvas(큰 공사) / 늦은 시작 + 쪼개기(채택)
- 이유: 사용자가 준 SEO 실무 체크리스트(11/09)로 점검한 결과. 운영 홈 Lighthouse 모바일 78(TBT 930ms), 307, 고정 OG 주소, 수동 점검뿐이던 것을 고친다
- 자료: 로컬 4배 느린 CPU에서 홈 TBT 150~370ms → 50~120ms, 남은 긴 작업은 WebGL 컨텍스트 생성(약 100ms). 11/10 배포(`e9f3ee09`) 뒤 운영 Lighthouse 모바일 홈 78 → 89~92(TBT 930 → 310~400ms)
- 문서: [01-frontend.md](01-frontend.md) "SEO·GEO" 11/09·"자동 점검", [guides/3d-hero.md](guides/3d-hero.md) "시작 순서(11/09)", [guides/domain-setup.md](guides/domain-setup.md) "workers.dev 주소"

## 2026-11-07

### S-014 · 확정 · 예전 workers.dev 주소는 `bettercurl.dev`로 301
- 결정: `portfolio-web.yeonghun-yoo.workers.dev`를 다시 켜고(`workers_dev: true`), 들어온 요청은 경로·쿼리를 그대로 붙여 `https://bettercurl.dev`로 보낸다(GET·HEAD 301, 그 밖 308). 버전별 미리보기 주소(`preview_urls`)는 끈 채로
- 본 것: 꺼 둔 채로(11/04 배포 뒤 상태 — 예전 링크가 죽음) / 켜고 그대로 서빙(같은 내용이 두 주소 — 검색 중복, 로그인 쿠키·OAuth 주소가 갈림) / 대시보드 Redirect Rules(도메인 영역에만 걸리고 workers.dev에는 안 걸림)
- 이유: 이력서·메일 등에 남은 예전 링크를 살리고 주소는 하나로 모은다. workers.dev는 내 영역이 아니라 Worker 코드로만 돌릴 수 있다
- 비용: 정적 파일은 원래 Worker를 거치지 않아 리디렉션할 수 없다 → 페이지 경로를 `assets.run_worker_first`로 Worker에 먼저 보낸다. `bettercurl.dev` 페이지 요청도 Worker 호출로 센다(무료 하루 10만 회 안). 해시 붙은 빌드 파일(`/_astro/*`)·이미지는 빼서 그대로 바로 나간다
- 사용자 요청(11/07). 배포해야 반영된다
- 문서: [guides/domain-setup.md](guides/domain-setup.md) "workers.dev 주소"

## 2026-11-06

### S-013 · 확정 · 히어로 문구를 이력서 원문으로
- 결정: 인트로 세 줄을 원래 포트폴리오 이력서 "소개" 문단에서 가져온다 — `// Software Engineer · iOS · Builder` 플랫폼이나 직무에 저를 가두지 않습니다 / `// 01 · 반복되는 문제` 반복되는 문제는 도구를 직접 만들어 해결합니다 / `// 02 · 도구 → 서비스` 도구를 만들고, 그 도구로 서비스를 만듭니다. 영어는 영어 이력서(`resume.en.md`)의 같은 문장. 숨김 제목(h1)도 "유영훈 — Software Engineer · iOS · Builder"로. 마지막 "BETTER CALL YH!"는 그대로
- 본 것: A 소개 문단(채택) / B 일하는 원칙("귀찮음은 아이디어의 시작점", "말보다 눈으로 보여 줍니다") / C 원칙 1로 시작해 소개 문단으로 끝내기
- 이유: 사용자 요청(11/06) — 이전 문구("흐릿한 생각에서 시작합니다", "신속하고 빠른 개발자")가 본인 말 같지 않았다. 이력서·OG 이미지의 직함과도 맞는다
- 자료: `src/content/rag/resume.ko.md` "소개"

## 2026-11-05

### S-012 · 확정 · 제목 글꼴 Quantico (Black Han Sans를 바꿈), 히어로 눈 숫자는 계속 바뀐다
- 결정: 제목·섹션 제목(`// About`)·프로젝트 이름·히어로 문구·연락 큰 글자를 Quantico 700(라틴, `@fontsource/quantico`)으로. 한글은 Quantico에 없어 IBM Plex Sans KR 700으로 이어진다. 숫자·라벨·챗 프롬프트는 IBM Plex Mono 그대로, 본문 IBM Plex Sans KR 그대로. Black Han Sans는 뺀다. 히어로 흉상 눈의 ASCII 숫자(0·1)는 칸마다 고정이 아니라 칸마다 다른 박자로 계속 바뀐다(히어로가 화면에 있을 때만, 초당 12번 갱신)
- 본 것(견본 artifact SsDzCJmjE1e6vuHRmZDqYU): A Oxanium 800·600 + 프롬프트 Silkscreen / **B Quantico 700 + 프롬프트 Plex Mono** / C Oxanium + 섹션·프롬프트 Silkscreen. 원하는 느낌은 "기계적이고 딱딱한 각진 글꼴, 너무 90°는 말고"
- 이유: 사용자 선택(11/05) — B. 한글 제목이 Plex Sans KR로 이어져도 견본에서 어색하지 않았다. 눈 숫자가 움직여야 기계 눈처럼 살아 보인다
- 문서: [01-frontend.md](01-frontend.md) "타이포·가독성", [guides/3d-hero.md](guides/3d-hero.md)

### S-011 · 확정 · 홈 프로젝트 목록에 썸네일 (S-007의 "썸네일 없음"을 뒤집음)
- 결정: 프로젝트마다 16:10 썸네일 — 상세 갤러리 첫 장(`images[0]`), 없으면 같은 크기의 빈 칸(바탕 surface, 둥근 모서리). 데스크톱은 왼쪽 15rem, 모바일은 위에 전체 폭
- 이유: 사용자 요청(11/05) — 목록에도 썸네일, 당장 이미지가 없어도 자리부터. 이미지를 넣으면 코드 수정 없이 채워진다
- 지금: Forest만 이미지 있음(나머지 3개는 빈 칸)

### S-010 · 확정 · 홈 본문 — 무채색 + 강조색 하나, 소개 → 경력 → 스택 → 프로젝트 → 연락
- 결정: 히어로 뒤 본문을 표·보고서 형식에서 큰 글자와 여백만으로 바꾼다. 색은 사이트 다크 그대로, 강조색(연보라)은 구분·강조(지표 숫자·지금 회사·→·포커스)에만. 장식 없음(섹션 표시는 `// 소개` 같은 작은 글자). 스택 섹션을 새로 둔다(실무 / 개인 프로젝트, `src/data/stack.ts` — 근거는 RAG `stack.{ko,en}.md`)
- 본 것: 표·정보 칸(S-009 첫 본문) / Wild 레퍼런스의 흰 바탕 + 노랑·파랑·빨강 픽셀·색 태그(인트로와 톤이 안 맞아 버림, 다크 통일) / ASCII 메인 테마 + 해독 타이포그래피(정신없어 적용 뺌, `src/lib/scramble.ts`만 남김) / 유리 타일 픽셀(취소)
- 이유: 사용자 요청(11/05) — 심플·미니멀, 보고서 형식 탈피, 다크 통일, 소개·스택을 위로
- 문서: [01-frontend.md "홈 (11/05)"](01-frontend.md)

### S-009 · 확정 · 홈 = 3D 픽셀 히어로 + 패럴랙스 커튼 + 정리된 본문 (S-007·S-008 확정, 모델은 임시 흉상)
- 결정: 홈 첫 화면은 "Better call yh!" 3D 픽셀 히어로(스크롤 252vh, 카메라 2스텝), 이어서 본문이 패럴랙스로 덮고(장면 35% 속도), 본문은 소개(+정보 칸) · 프로젝트 목록 · 경력 목록 · 연락. 사용자 요청으로 메인 반영·배포. 실제 얼굴 스캔·모델 교체는 후순위
- 확정한 값(프로토타입에서 사용자와 맞춤): 칸 16px(1280px에서 80칸 ≈ 처음의 75%), 계조 6, 디더 기본, 처음 8% 스크롤에 최대 해상도로 맺히고 유지, 인물은 화면 왼쪽 대각을 봄, 1스텝 인물의 오른쪽 대각 → 왼쪽 대각에서 오른쪽 눈, 2스텝 왼쪽 눈 → 줌아웃, 화면 기울기·끄덕임 잔물결. 변호사 컨셉 라벨(사건 기록 등)은 쓰지 않는다 — "BETTER CALL YH!" 한 줄만
- 바뀐 것: 11/03 캔버스 홈(글자 그림 이름·엇갈린 프로젝트·경력 막대, `home.ts`·`tap-peek.ts`)은 걷어냈다. S-007 미결 답("유지": 글자 그림·숫자 연출)은 히어로가 대신하므로 뒤집는다
- 구현: three.js는 WebGL이 될 때만 동적 import(초기 JS는 홈 스크립트 gzip 약 1KB, 3D 덩어리 약 144KB는 그 뒤). 움직임 줄이기·스크립트 없음·WebGL 없음 = 짧은 정적 히어로(포스터 + 마지막 문구)
- 문서: [01-frontend.md "홈 (11/05)"](01-frontend.md), [guides/3d-hero.md](guides/3d-hero.md)

### S-008 · 제안 · 테마 "Better call yh!" — 본인 얼굴 3D 스캔을 픽셀화한 스크롤 히어로
- 결정(제안): 도메인 `bettercurl.dev`의 말장난으로 변호사 광고 오마주. 본인 얼굴을 스캔해 3D로 두고, 저해상도 격자 + 흑백 계조 + 디더링으로 픽셀화, 블러 → 선명으로 초점이 맞아 가며, 스크롤로 카메라가 다가가 마지막에 줌인. 1차는 미리 렌더한 프레임(스프라이트, 모든 기기), 2차는 실시간 three.js(데스크톱). 3D를 7단계에서 홈 개편과 같이 앞당긴다
- 본 것: 손으로 찍은 픽셀 그림(11/05 시안 A~C — 카툰·게임 느낌이라 버림) / 원작 밈 영상을 픽셀화(저작권·초상권, 공개 레포 재배포 — 버림) / 본인 재연 영상을 픽셀화(가능, 3D보다 카메라 자유가 적음) / 3D 스캔 + 픽셀 셰이더(채택 제안)
- 이유: 실사 기반 픽셀이 게임 느낌 없이 "저해상도 광고 사진" 질감을 낸다. 픽셀화가 스캔의 어색함을 가린다. 원작 소재를 쓰지 않아 권리 문제가 없다. 같은 장면 코드로 프로토타입·프레임·실시간을 다 만든다
- 자료: Mobbin 레퍼런스 Base(점 격자)·General Intelligence Company(픽셀 장면 + 블러 유리 카드)·Wild(픽셀 글자) — 링크는 설계 문서. 아티팩트 "yhy 홈 구조 개편 시안"(테마 A~C), "Better Call YH 3D"(프로토타입)
- 문서: [guides/3d-hero.md](guides/3d-hero.md). 스캔 원본은 `hero-src/`(커밋 안 함)

### S-007 · 제안 · 홈을 구조화된 정적 템플릿으로 (11/03 캔버스 홈을 바꾸는 안)
- 결정(제안): 자유 배치 캔버스(11/03, Clipo 레퍼런스) 대신 열 맞춘 목록·표 — 소개(+정보 칸) · 프로젝트 텍스트 인덱스 · 경력 3단 표 · 연락. 테마·글꼴은 그대로. 새 페이지 없음
- 본 것: 지금 캔버스 유지 / 카드 그리드(이미지 중심, Pentagram·Unseen Studio) / 텍스트 인덱스·표(Locomotive·Webflow·Linear)
- 이유: 사용자 요청(11/05) — 지금보다 구조화된 정적 템플릿. 표·목록은 스크립트 없이 완성되고, 같은 데이터로 JSON-LD·`llms.txt`를 만들 수 있어 SEO·GEO와 맞물린다. 지금 테마(어두운 바탕·고정폭 라벨)와 Linear·Webflow식 목록이 잘 맞는다
- 자료: Mobbin 섹션 검색(11/05) — 링크는 설계 문서 표에
- 문서: [01-frontend.md "홈 개편안"](01-frontend.md#홈-개편안-1105-제안--decisions-s-007). 미결 4가지(글자 그림·역할 문구·썸네일·숫자 연출)를 정하면 확정으로 바꾼다
- 보탬(11/05): 미결 4가지는 사용자 답 "유지" — 글자 그림 남김, 경력 역할 열 없음, 썸네일 없음, 숫자 연출 남김. 개편 자체는 아직 제안(구현 착수 전)

---

## 2026-11-04

### S-006 · 확정 · 메일 주소 체계 — 받기는 Cloudflare Email Routing, 보내기는 Resend 하위 도메인
- 결정: 사이트·챗에 보이는 연락처 `hello@bettercurl.dev`, 레터 수신 `letters@bettercurl.dev`(둘 다 Email Routing → 개인 메일로 전달), 발신 `letters@mail.bettercurl.dev`(Resend 하위 도메인. 11/04 루트 `bettercurl.dev`가 먼저 인증돼 잠시 루트 주소로 바꿨다가, 평판 분리·나중의 루트 메일함을 위해 `mail.`로 되돌림). 관리자 로그인 이메일은 개인 메일 그대로
- 본 것: 개인 Gmail을 사이트·레터에 그대로 / 루트 도메인에서 발신(`letters@bettercurl.dev`) / Google Workspace 메일함(유료)
- 이유: 개인 메일을 공개하지 않고, 주소를 나중에 바꿔도 사이트는 그대로. Email Routing은 무료, 받는 MX(루트)와 Resend의 보내는 MX(`send.mail.`)가 겹치지 않는다. Resend는 보내기 전용 하위 도메인을 권한다
- 보탬(11/04): `MAIL_FROM`·`LETTER_TO`는 비밀값에서 `wrangler.jsonc` `vars`로 옮김 — 공개 주소라 숨길 이유가 없고, 코드에 있어야 클라우드·로컬 어디서 배포해도 같은 값. `RESEND_API_KEY`만 운영 Secret(대시보드)
- 문서: [guides/domain-setup.md](guides/domain-setup.md), [guides/resend-setup.md](guides/resend-setup.md)

### S-005 · 확정 · 도메인 `bettercurl.dev` 구매
- 결정: `bettercurl.dev`(Cloudflare Registrar, 첫해 $8.20 / 갱신 $12.20). 보조 도메인은 사지 않음(나중에 실명 `yeonghun.dev`를 살 수 있음, 11/04 기준 구매 가능)
- 본 것: `yeong.dev`(이미 등록), `yeong.build` $25.20, `yeonglab.dev`, `yeongbuilds.dev`, `curlyeong.dev`, `bettercallyeong.dev`(김), `young.dev`(프리미엄·주니어로 읽힘), `godev`(Go 언어 `go.dev`와 겹침), `zerodev`(같은 이름 회사), `odev`(터키어 "숙제"), `enter.dev`(이름과 무관)
- 이유: "Better Call ○○"의 개발자 버전(call → `curl`, 소리·글자·뜻이 겹침), 짧고 세일즈 문구가 된다. 약점(사람이 안 보임, HTTP 도구 이름처럼 읽힘, `.com`은 남의 것)은 알고 간다. 원작의 이름·로고·인물·대사는 쓰지 않는다
- 자료: Cloudflare Registrar `POST /registrar/domain-check` 조회(11/04) — 조회 방법은 [00-infra.md](00-infra.md)
- 문서: [overview.md](overview.md) 결정 표

### S-004 · 확정 · 챗 답에서 링크는 GitHub(`github.com/yeonghunyoo/…`)만
- 결정: 답의 마크다운 링크·맨 주소 중 `github.com/yeonghunyoo` 아래만 새 탭 링크로, 나머지는 글자. 답변 프롬프트도 문서에 있는 GitHub 주소만 허용
- 본 것: 링크 전부 금지(이전) / 문서에 있는 모든 주소 허용
- 이유: 모델이 지어낸 주소로 방문자를 보내지 않는다(가드레일 8층). 코드 위치를 묻는 질문에는 바로 누를 수 있어야 한다
- 문서: [05-06-chat-rag.md](05-06-chat-rag.md) 가드레일 8층

### S-003 · 확정 · RAG 문서는 실명 "유영훈"(영어 "Yeonghun Yoo"), "yhy"는 사이트 이름으로만
- 결정: RAG 문서에서 사람을 가리키는 "yhy"를 실명으로. 챗 답변·프롬프트의 호칭은 그대로("문서만" 범위)
- 이유: 포트폴리오·세일즈에서 누구인지가 분명해야 한다. FAQ 답에 주어를 넣어 영어 번역이 1인칭 "I"로 나오지 않게 했다
- 문서: [05-06-chat-rag.md](05-06-chat-rag.md) "문서 속 이름"

### S-002 · 확정 · 영어 RAG 문서는 한국어 원문에서 자동 번역
- 결정: 한국어 문서를 고치고 `pnpm rag:translate`로 영어판을 만든다(Workers AI, 구조 검사). 손으로 쓴 영어 문서는 덮어쓰지 않는다
- 본 것: 같은 slug에 그 언어 문서가 없으면 언어 가중을 끈다(코드 한 곳) / 영어 문서를 손으로 관리
- 이유: 영어 질문 재현율 실패("What did you do at holich?")를 문서로 해결하고, 원문은 한 벌만 관리. 이후 운영 평가 재현율 100%
- 문서: [05-06-chat-rag.md](05-06-chat-rag.md) "영어 문서 자동 번역"

### S-001 · 확정 · FAQ와 스택 경험 수준
- 결정: FAQ 8개(원격 근무 지향·출근은 서울·경기, 이력서는 레터로 요청 — 자동 발송은 나중), 스택은 실무 / 개인 프로젝트 두 단계로 문서 근거가 있는 것만. 근무 형태(정규직·계약)는 넣지 않음
- 문서: [guides/chat-rag-setup.md](guides/chat-rag-setup.md) "남은 일" 2
