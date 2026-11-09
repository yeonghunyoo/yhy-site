# 포트폴리오 웹 MVP 설계도 — 개요 · 결정 · 로드맵

작성일 2026-10-28 · 작성자 yhy

## 개요와 목표

MVP는 "빌더로서의 yhy를 보여주는 한/영 정적 사이트 + 방문자가 로그인 없이 레터를 보내고, 내가 어드민에서 읽는 것"(11/04 방문자 로그인 없앰 — 로그인은 관리자만 `/admin`에서)까지다. 첫 공개 프로젝트는 이 포트폴리오 자체이며, 만드는 과정이 곧 콘텐츠가 된다.

**포지셔닝**: 특정 분야 개발자가 아닌 빌더·개발자. 기술 스택 나열이 아니라 "무엇을 왜 만들었고 결과가 무엇인가" 단위로 보여준다.

**MVP 범위 (1차)**

- Cloudflare 위에 Astro 정적 사이트, /ko·/en 분리
- 인트로 섹션 1개 + 프로젝트 "이 포트폴리오" 상세
- 관리자 로그인: 이메일(매직링크·코드) + Google, `/admin`에서만
- 레터 보내기 모달(로그인 없이, 답장 이메일 직접 입력) → 내 메일 + DB 저장
- /admin 간략 대시보드

**2차 이후**: RAG 챗(Workers AI), 3D/셰이더 아일랜드, 추가 프로젝트.

**비범위**: 블로그, 댓글, 다중 관리자, 결제, 네이티브 앱.

## 확정된 결정 사항

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 목표 | MVP | 1차는 정적 사이트 + 로그인 + 레터 + 어드민까지 |
| 인프라 | Cloudflare 단일 (Workers) | Workers(정적 자산 + 동적)·D1·KV·Vectorize·R2·Registrar를 한 계정에서, 월 비용 0에 가깝게. 10/28 Pages에서 전환 — Astro 어댑터가 Pages 지원 중단 |
| 프론트 | Astro | 정적 우선, 상호작용 부분만 React 아일랜드 |
| 언어 | 한/영, /ko·/en 경로 분리 | SEO와 공유 링크에 유리 |
| 도메인 | **`bettercurl.dev` (11/04 구매, Cloudflare Registrar)** — 첫해 $8.20 / 갱신 $12.20(USD). 연동 순서·주소 체계는 [guides/domain-setup.md](guides/domain-setup.md). 원작 문장 "Better Call ○○"의 개발자 버전: call → `curl`(주소를 호출하는 명령어). 소리(콜·컬)·글자(개발자 명령어)·뜻(부르다)이 겹친다 | 짧고 패러디가 분명, 세일즈 문구("Build broken? Better curl.")가 된다. 알고 가는 약점: 이름에 사람이 안 보임 → 실명 보조 도메인(`yeonghun.dev` 등)으로 메움, HTTP 도구 이름처럼 읽힐 수 있음, `bettercurl.com`은 이미 남의 것, curl은 오픈소스 프로젝트 이름이라 "더 나은 curl" 도구처럼 홍보하지 않는다. 원작의 이름(Saul)·로고 글꼴·인물·대사는 쓰지 않는다. 검토 후 버린 것: `yeong.dev`(이미 등록), `young.dev`(프리미엄·주니어로 읽힘), `godev`(Go 언어 `go.dev`와 겹침), `zerodev`(같은 이름 회사), `odev`(터키어 "숙제"), `enter.dev`(이름과 무관), `bettercallyeong.dev`(너무 김) |
| 디자인 톤 | 글자·숫자·가는 선 중심, 캔버스 위 자유 배치 (11/03 확정) | 나이트 한 가지(차콜 바탕 + 연보라 파랑 강조, 기기 설정과 상관없음). 표시 분홍. 글꼴 Quantico(제목, 11/05 Black Han Sans에서 바꿈) + IBM Plex Mono(숫자·라벨), 본문 IBM Plex Sans KR. 상세는 [01-frontend.md](01-frontend.md) "홈" |
| UI 레퍼런스 | Mobbin | 화면 패턴 참고용(코드 아님). 실제 구현은 Tailwind + CSS 라이브러리 |
| UI 라이브러리 | daisyUI 5 (10/29 확정) | 순수 CSS Tailwind v4 플러그인 — JS 0KB, CSP 문제 없음. 테마는 CSS 변수라 세계관이 정해지면 커스텀 테마로 교체. 다이내믹 효과는 daisyUI가 아니라 View Transitions·scroll-driven animations(CSS), 필요한 곳만 지연 로드 JS로 |
| 인증 | 이메일 매직링크 + Google OAuth | Better Auth, 메일은 Resend |
| 로그인 기능 | 레터 모달, 어드민 대시보드 | 방문자 → 나 연락 채널 + 내 관리 화면 |
| 첫 프로젝트 | 이 포트폴리오 자체 | 문서 준비 부담 최소, 빌더 메시지 직접적 |
| 챗/RAG | 후순위, Workers AI (11/01 Haiku에서 변경) | 답변·임베딩·리랭크를 한 바인딩에서, 하루 무료 범위 안에서 운영. 구조는 WeKnora `rag_stream` 참고 — 질문 재작성 → 하이브리드 검색 → 리랭크 → 부모 섹션 확장. [05-06-chat-rag.md](05-06-chat-rag.md) |
| 3D/셰이더 | 옵션, 기초 수준 소급 적용 | 아일랜드로 나중에 끼워도 구조 영향 없음 |
| 레포 | GitHub Public, pnpm | 코드 자체가 포트폴리오, 비밀은 전부 환경변수 |
| 구현 방식 | Claude가 구현, 본인은 프로세스 이해·판단 | 세부 구현 지식은 필수 아님 |
| MVP 구현 (10/29) | 1–4단계 로컬 구현·검증 완료. Astro i18n 라우팅 미사용, React 아일랜드는 `client:demand`, CSP는 Astro 해시, 로그인 수는 KV | 각 단계 문서의 "구현 메모 (10/29)" |
| 인증·레터·어드민 상세 (10/28) | 제자리 복귀 + 시트 자동 재개, 개인정보 페이지 + 계정 삭제, 사이트 내 답장, 첨부 불허, Telegram 알림, 단순 HTML 메일, Cloudflare 기본 로그 | 각 단계 문서의 "상세 설계 (확정)" 참조 |

## 구성 한눈에

```mermaid
flowchart LR
  B["방문자 브라우저<br/>Astro 정적 HTML + React 아일랜드"] --> P["Workers 정적 자산<br/>/ko, /en"]
  B --> F["Worker 코드<br/>/auth /api /admin SSR"]
  F --> D1[("D1<br/>유저·세션·레터")]
  F --> KV[("KV<br/>레이트리밋")]
  F --> R["Resend<br/>매직링크·레터·답장"]
  F --> G["Google OAuth"]
  F --> T["Telegram 알림"]
  F -.2차.-> V[("Vectorize")]
  F -.2차.-> AI["Workers AI<br/>답변·임베딩·리랭크"]
```

하나의 Worker가 정적 자산과 동적 요청을 함께 받는다. 정적 페이지는 Workers 정적 자산으로 바로 나가고, 동적 경로만 Worker 코드가 처리한다. Worker 코드만 D1·KV·외부 서비스에 닿고, 비밀은 전부 Worker 시크릿에 있다. 서비스별 한도와 배포 흐름은 [00-infra.md](00-infra.md) 참조. 점선은 2차(MVP 이후)에 추가되는 요소다.

## 단계별 로드맵

```mermaid
flowchart LR
  S0["0 인프라"] --> S1["1 프론트+반응형"] --> S2["2 인증"] --> S3["3 레터"] --> S4["4 어드민<br/>MVP 공개"]
  S4 -.-> S56["5-6 챗+RAG"] -.-> S7["7 3D/셰이더"]
```

각 단계는 앞 단계의 완료 기준을 통과한 뒤 시작한다. 3→4가 챗보다 앞에 오는 이유는 인증만 있으면 완성되는 반면, 챗은 비용·프롬프트 튜닝이 따라붙어 꼬리가 길기 때문이다.

**단계별 상세 문서**

| 단계 | 문서 |
| --- | --- |
| 0 인프라 | [00-infra.md](00-infra.md) |
| 1 프론트 + 반응형 | [01-frontend.md](01-frontend.md) |
| 2 인증 | [02-auth.md](02-auth.md) |
| 3 레터 | [03-letters.md](03-letters.md) |
| 4 어드민 (MVP 완료) | [04-admin.md](04-admin.md) |
| 5–6 챗 + RAG | [05-06-chat-rag.md](05-06-chat-rag.md) |
| 6 보강 · 문서 수집(설계안) | [06-ingest.md](06-ingest.md) |
| 7 3D/셰이더 | [07-3d-shader.md](07-3d-shader.md) |
| 공통 데이터·환경변수·보안 | [common.md](common.md) |

**남은 할 일 전체는 [work-plan.md](work-plan.md)**(11/06). 운영 공개 절차는 [guides/mvp-launch.md](guides/mvp-launch.md), 챗·RAG 연동은 [guides/chat-rag-setup.md](guides/chat-rag-setup.md).

큰 기능(인증, 레터, 어드민, 챗+RAG, 3D)은 각각 독립 문서이고, 데이터 모델·환경변수·보안은 common.md에서 한 번만 관리한다.

## 미결정 사항과 2차 디테일

**착수 전 결정 (0단계 블로커)**

- [x] 브랜드/닉네임과 도메인 — **`bettercurl.dev` 구매(11/04)**, 연동은 `guides/domain-setup.md`. 보조 도메인(실명 `yeonghun.dev`, 오타 대비 `curlyeong.dev`·`callyeong.dev`)을 살지, 사이트 이름 "yhy"를 바꿀지는 따로 정한다
- [x] 디자인 톤·테마(11/03) — 글자·숫자 중심 미니멀, 나이트. 브랜드·도메인은 여전히 미정
- [x] CSS 라이브러리 — daisyUI 5, UI 레퍼런스는 Mobbin (10/29)
- [x] 레터 수신 메일 주소와 관리자 이메일 — 레터 수신 `letters@bettercurl.dev`, 사이트 연락처 `hello@bettercurl.dev`(둘 다 Cloudflare Email Routing → 개인 메일), 발신 `letters@mail.bettercurl.dev`(Resend). 관리자는 개인 메일 그대로(11/04)

**2차 디테일 (해당 단계에서 질의로 채움)**

| 영역 | 정할 것 | 어느 단계 |
| --- | --- | --- |
| 콘텐츠 | 인트로 한 줄 문구(한/영), 프로젝트 "이 포트폴리오" 문제·접근·결과 본문 — 초안 작성됨, 다듬기 필요 | 1 |
| 콘텐츠 | 변경 이력(빌드 로그)을 git 커밋에서 자동 생성할지 수동 작성할지 — 지금은 프로젝트 마크다운 frontmatter `changelog`에 수동 | 1 |
| SEO | 코드 완료(11/05 canonical·hreflang·OG·robots·sitemap, 11/09 JSON-LD·`llms.txt` — `01-frontend.md` "SEO·GEO"). 남은 것은 운영자 작업: Search Console·Bing 등록과 sitemap 제출 | 1 |
| 분석 | Cloudflare Web Analytics(쿠키 없음) 사용 여부 | 1 |
| RAG | 청크 크기 튜닝, 스택 경험 수준 표기 방식 | 6 |
| 3D | 효과 종류·색감 — 세계관 콘셉트에 종속 | 7 |
| 접근성 | 키보드 포커스 순서, 스크린리더 레이블, 색 대비 4.5:1 | 전 단계 |

## 비용·남용 방지 (11/03)

무료 한도를 넘지 않도록 사이트 전체 일일 상한(차단기), 비정상 요청 방어, 긴급 차단 스위치, 관리자 사용량 대시보드(`/admin/usage`)를 둔다. 설계와 운영자가 직접 할 대시보드 설정은 [guides/cost-guard.md](guides/cost-guard.md).
