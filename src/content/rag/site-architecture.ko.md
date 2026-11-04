---
title: 이 포트폴리오 사이트의 구조
---

## 사이트 구조 개요

이 사이트는 빌더·개발자 yhy의 한/영 포트폴리오다. 정적 페이지로 프로젝트를 보여 주고, 방문자는 로그인 없이 레터(메시지)를 보낼 수 있고, 관리자는 /admin에서 로그인해 레터를 읽고 답한다. 방문자 사이트에는 로그인이 없다. 2차 기능으로 포트폴리오 문서를 근거로 답하는 챗(RAG)이 붙어 있다. 3D·셰이더는 아직 만들지 않은 2차 이후 기능이고, 브랜드·도메인·세계관 디자인은 미정이다.

한 줄 구조: 방문자 브라우저 → Cloudflare Worker 하나(정적 자산 + 동적 코드) → D1·KV·R2·Vectorize·Workers AI, 그리고 외부 서비스 Resend(메일)·Google(관리자 로그인)·Telegram(알림).

만든 순서는 0 인프라 → 1 프론트+반응형 → 2 인증 → 3 레터 → 4 어드민(MVP) → 5–6 챗+RAG → 7 3D이며, 각 단계는 앞 단계의 완료 기준을 통과한 뒤 시작했다.

## 기술 스택과 고른 이유

- Astro 7: 정적 우선 사이트. 대부분 페이지는 빌드 때 HTML로 만들고, 동적 경로(/, /admin, /api, /auth, /media)만 서버에서 렌더한다
- React 19 아일랜드: 방문자 사이트에서는 레터 시트·토스트(Overlay)와 챗 독(ChatDock)만, 어드민에서는 관리자 로그인(AdminLogin)이 React다. 나머지는 JS 없는 HTML이다
- Tailwind CSS v4 + daisyUI 5: 순수 CSS 컴포넌트라 JS가 0KB이고 CSP와 충돌하지 않는다. 디자인 토큰은 src/styles/tokens.css 한 곳에 있다
- Cloudflare 단일 인프라: Workers·D1·KV·R2·Vectorize·Workers AI를 한 계정에서 써서 월 비용을 0에 가깝게 유지한다. 10/28 Pages에서 Workers로 옮겼다(Astro 어댑터가 Pages 지원을 끝냄)
- Better Auth: 관리자 전용 비밀번호 없는 로그인(매직링크·인증 코드·Google), D1 어댑터
- Drizzle ORM: D1 스키마와 마이그레이션
- Resend(메일), Telegram 봇(운영 알림)
- 런타임 Node 24, 패키지 매니저 pnpm, 타입 검사 TypeScript 6

## 인프라: Cloudflare Worker와 바인딩

Worker 하나(portfolio-web)가 정적 자산과 동적 요청을 함께 받는다. 정적 페이지는 Workers 정적 자산(ASSETS)에서 바로 나가고, 동적 경로만 Worker 코드가 처리한다. Worker 코드만 저장소와 외부 서비스에 닿는다.

Worker가 쓰는 바인딩:
- DB → D1: 사용자·세션·레터·챗 로그·RAG 섹션과 청크
- KV → KV: 레이트리밋 카운터(로그인 메일·레터 IP), 일별 관리자 로그인 수, IP별 챗 턴·월 토큰, 알림 중복 억제, 벡터 id 목록
- R2 → R2 버킷 portfolio-rag: RAG 원본 파일(비공개)과 문서 이미지(/media로 공개)
- VEC → Vectorize 인덱스 portfolio-rag: 1024차원 코사인, 청크 벡터
- AI → Workers AI: 답변·슈퍼바이저·임베딩·유해 검사 모델

배포: GitHub에 푸시해도 배포되지 않는다. 운영 배포는 로컬에서 `pnpm run deploy`(astro build → wrangler deploy)로만 하고, 운영 비밀은 Worker 시크릿에 있다. 레포는 GitHub Public이라 비밀은 커밋하지 않는다.

## 요청 흐름: 정적 페이지와 동적 경로

1. 브라우저가 /ko, /en, /ko/projects/…, /ko/privacy 같은 정적 페이지를 요청하면 Worker의 정적 자산이 빌드된 HTML을 바로 돌려준다. 세션 확인을 하지 않는다
2. 루트 /는 동적 페이지다. Accept-Language를 보고 /ko 또는 /en으로 302 보낸다
3. 동적 경로(/admin, /api/*, /auth/*, /media/*)는 Worker 코드로 간다. 먼저 미들웨어(src/middleware.ts)가 실행된다
4. 미들웨어는 /admin·/api 요청이면 Better Auth로 세션을 읽어 locals.user에 넣는다
5. /admin 화면 요청인데 로그인하지 않았으면 미들웨어가 /admin/login으로 rewrite한다(로그인했지만 관리자가 아니면 "권한이 없어요"). /api/admin 요청인데 관리자가 아니면 404를 돌려준다(존재 자체를 숨김)
6. 핸들러가 응답한다. 5xx가 나면 미들웨어가 Telegram으로 알린다(1분 1회)

보안 헤더: 페이지마다 CSP를 <meta>로 넣고, 인라인 스크립트는 Astro가 해시로 허용한다. 그래서 HTML의 style="" 속성은 쓰지 않는다.

## 화면 구조: Astro 페이지와 React 아일랜드

- 언어: /ko와 /en을 src/pages/[locale]/로 따로 만든다. 문자열은 src/i18n/ko.json·en.json, 긴 본문은 content collection의 {slug}.ko.md·.en.md다. Astro 내장 i18n 라우팅은 쓰지 않는다
- 아일랜드 로딩: React 아일랜드는 커스텀 지시어 client:demand로 붙는다. 방문자는 처음엔 React를 받지 않고, [data-action] 버튼을 처음 누를 때(또는 토스트·새로고침 재개가 있을 때)만 하이드레이트한 뒤 그 클릭을 이어 처리한다. 세션 확인은 하지 않는다. 초기 JS 예산은 50KB이고 11/03 측정은 7.2KB다
- Overlay 아일랜드가 레터 시트와 토스트를 띄우고, ChatDock이 챗 독을 맡는다. 방문자 사이트에는 로그인 버튼·계정 메뉴·로그인 시트·계정 삭제 시트가 없다
- 배포 전에 열어 둔 탭이 지워진 JS를 부르면 demand 지시어가 한 번 새로고침한 뒤 누른 기능을 다시 연다
- 모바일 우선: 기본 스타일이 모바일이고 md 이상에서 넓힌다. 터치 타깃 44px, 100dvh, safe-area를 쓴다
- 키보드 대응: 챗 독과 시트는 visualViewport를 매 프레임 읽어 높이·위치를 DOM에 바로 맞춘다(viewport.ts). 열려 있는 동안 배경 스크롤을 잠그고 허용 영역 밖 터치 스크롤을 막는다(scroll-lock.ts)
- 로딩 상태: 비동기 버튼은 진행 중 disabled + aria-busy, 스피너는 global.css가 그린다

## 관리자 로그인: Better Auth, 매직링크, 인증 코드, Google

로그인은 관리자만 쓴다. 방문자는 로그인하지 않는다. 로그인하지 않은 채 /admin 화면을 열면 미들웨어가 /admin/login(src/pages/admin/login.astro + React 아일랜드 AdminLogin.tsx)으로 rewrite한다. 로그인 핸들러는 /auth/*(src/pages/auth/[...all].ts)이고 설정은 src/lib/server/auth.ts에 있다. 비밀번호는 받지 않는다.

이메일 로그인 흐름:
1. /admin/login에서 이메일 입력 → POST /auth/sign-in/magic-link
2. hooks.before가 레이트리밋을 검사한다(IP당 10분 3회, 같은 이메일 10분 1회, KV)
3. sendMagicLink가 링크 토큰을 D1 verification에 저장하고, 같은 메일에 넣을 6자리 코드를 createVerificationOTP로 만든다(해시로 저장, 15분, 3번 틀리면 무효)
4. Resend가 링크와 코드가 든 메일 한 통을 보낸다
5. 같은 브라우저에서 링크를 열면 바로 세션이 생긴다. 링크가 메일 앱 안 브라우저나 다른 기기에서 열리면, 원래 브라우저의 로그인 화면에 코드를 넣는다 → POST /auth/sign-in/email-otp(IP당 10분 10회) → 세션
6. 로그인 후 /admin으로 돌아온다. 로그인했지만 관리자가 아니면 "권한이 없어요"와 로그아웃 버튼이 보인다

Google 로그인은 OAuth로 같은 세션을 만든다. 카카오톡 같은 앱 안 브라우저에서는 Google이 막으므로 버튼을 끄고 안내한다. 세션은 D1, 쿠키 HttpOnly·Secure·SameSite=Lax, 30일이다. 차단된 사용자(user.is_blocked)는 세션 생성이 거부된다.

## 레터: 보내기, 메일, 알림, 답장

레터는 방문자가 로그인 없이 yhy에게 보내는 메시지다.

1. 방문자가 레터 시트를 열고 제목(선택, 80자), 본문(필수, 10~2,000자, 링크 5개 이하), 답장 받을 이메일(필수, 방문자가 직접 입력, 인증하지 않음)을 쓴다
2. 시트가 POST /api/letters를 부른다. 이 API는 세션을 읽지 않는다
3. 서버가 제한을 검사한다: IP 해시당 24시간 3통(KV letter:ip:{해시}), 사이트 전체 하루 상한 LETTER_DAILY_CAP, 같은 답장 주소의 직전 레터와 같은 본문이면 409. 봇 방어로 숨긴 함정 필드 website가 채워져 있으면 저장·발송 없이 성공으로 답한다. 스팸이 보이면 Turnstile을 나중에 붙일 수 있다
4. 서버가 D1 letters에 저장한다(user_id는 null)
5. 서버가 Resend로 yhy의 메일함에 보낸다(reply_to = 방문자가 쓴 이메일, 메일에는 Reply-To 줄만 있고 From·로그인 줄은 없다). 실패하면 status = failed로 남고 관리자가 재전송한다
6. 서버가 Telegram으로 새 레터를 알린다(발신자 마스킹, 응답과 분리된 waitUntil)
7. 관리자가 /admin/letters/{id}에서 답장을 쓰면 POST /api/admin/letters/{id}/reply → D1 letter_replies 저장 → Resend로 방문자에게 발송 → letters.status = replied

사이트 안에서 이어지는 대화 스레드는 없다. 답장 이후는 메일 스레드다.

## 관리자 화면: /admin

/admin은 서버 렌더 페이지이고, 이메일이 인증된 관리자만 연다. 관리자는 환경변수 ADMIN_EMAILS(최고 관리자) 또는 D1 user.is_admin(/admin/users에서 지정)이다. 로그인하지 않았으면 /admin/login이 뜨고, 로그인했지만 관리자가 아니면 "권한이 없어요"와 로그아웃 버튼이 뜬다. /api/admin/*는 비관리자에게 404이고, 미들웨어와 핸들러가 양쪽에서 확인하고, 폼 POST의 Origin도 같은 출처인지 본다.

화면:
- /admin 지표: 가입자 수, 최근 7일(KST) 일별 레터 수·로그인 수(가입·로그인은 이제 관리자 로그인만 반영). 차트는 라이브러리 없이 SVG 막대
- /admin/letters: 상태 필터(전체·안 읽음·답장함·실패), 상세에서 읽음 기록·답장·재전송
- /admin/users: 계정(관리자) 목록, 가입일·방식·마지막 로그인, 차단 토글(차단하면 그 사용자의 세션을 모두 지운다), 관리자 지정 토글
- /admin/chat: 챗 질문 로그(답변 본문 없음), 경로·가드 판정·토큰, 청크 수와 벡터 수, 벡터 갱신, 기준 질문 평가, 공격 질문 점검

쓰기 동작은 JS 없는 HTML 폼 POST → /api/admin/… → 303으로 원래 화면이다.

## 챗 전체 흐름

챗 독은 우하단에 접혀 있다가 열린다. 질문 하나는 이렇게 처리된다.

1. 챗 독이 POST /api/chat에 질문과 서명된 이력을 보낸다
2. /api/chat이 CHAT_ENABLED, 턴 제한(로그인 없이 IP 해시당 KST 하루 20턴), 사이트 전체 하루 턴 상한, 월 토큰 상한을 확인한다. 넘으면 "오늘은 여기까지예요(하루 20번). 레터로 이어가요."와 레터 버튼을 보여 준다
3. 파이프라인(chat-pipeline.ts)이 주입 정규식으로 질문을 검사한다. 걸리면 모델 없이 거절한다
4. Llama Guard 유해 검사와 슈퍼바이저 판단이 동시에 실행된다
5. 유해 판정이 먼저 적용된다(자해는 도움 안내)
6. 슈퍼바이저가 고른 경로로 간다: portfolio → 포트폴리오 에이전트(RAG 검색 + 근거 답변, 스트리밍), diagram → 흐름도 에이전트(같은 검색 뒤 Gemma 4가 노드·화살표 JSON과 요약을 만들고, 코드가 검사한 뒤 챗 화면이 SVG 흐름도로 그린다), chat → 슈퍼바이저의 짧은 답, contact → 레터 안내 + 레터 버튼, off_task → 고정 거절
7. 출력 검사(코드 블록·출처 표기 폭주)를 거쳐 SSE로 화면에 보낸다
8. chat_logs에 질문·경로·검색 기록·가드 판정·토큰을 남긴다(답변 본문은 저장하지 않음, 90일 보존)

하위 에이전트의 답은 슈퍼바이저를 다시 거치지 않고 바로 화면으로 간다.

## 슈퍼바이저와 경로 판단

슈퍼바이저(src/lib/server/agents/supervisor.ts)는 답변 모델과 같은 Gemma 4 26B를 추론 없이 부르고, JSON 스키마 출력 {route, query, reply}을 받는다. route는 portfolio·diagram·chat·contact·off_task 다섯 중 하나만 허용된다. diagram은 흐름·구조·관계를 그려 달라는 요청이고, 그림 없이 "어떻게 동작해?"만 물으면 portfolio다.

- 입력: 서명 검증된 최근 대화(최대 6턴), 질문, 그리고 문서 목차(D1 rag_sections의 slug·제목·섹션 제목, isolate마다 5분 캐시). 목차는 "헬미닥"처럼 포트폴리오에만 있는 이름을 알아보는 데만 쓴다
- portfolio면 대명사를 앞 대화로 푼 검색 질문(query)을 만들어 검색으로 넘긴다
- chat이면 1~2문장 답(reply)을 직접 쓴다. yhy에 관한 사실은 말하지 않는다
- 섞인 요청은 portfolio로 보내고 포트폴리오 부분만 query에 넣는다
- 실패 처리: 호출이 실패하면 300ms 뒤 한 번 더 시도하고, 그래도 실패하거나 JSON이 깨지면 원 질문으로 portfolio 경로를 탄다

11/03 측정(기준 질문 39개): 경로 정확도 100%, 포트폴리오 재현율 95%, 무관 작업 거절 100%. 슈퍼바이저 응답 중앙값 약 0.9초, 1회 약 10뉴런.

## RAG 검색: 포트폴리오 에이전트

포트폴리오 에이전트는 rag.ts의 retrieve()와 chat.ts의 답변 프롬프트로 이루어진다.

1. 키워드 검색: D1 FTS5(trigram) + 2글자 LIKE, 흔한 한국어 조사를 떼어 검색어를 만든다
2. 벡터 검색: bge-m3로 질문을 임베딩해 Vectorize에서 찾는다
3. 두 검색은 동시에 돌고 각각 상위 24개를 RRF(k=60)로 합친다. 키워드에 안 걸린 벡터 후보는 0.35 이상만 남긴다
4. 범위 판단: 가장 가까운 벡터 점수가 0.42 미만이면 근거가 없다고 보고 모델 없이 레터 안내로 끝낸다
5. 질문 언어와 같은 문서 1.2배, FAQ 1.1배를 곱하고 자식 청크를 부모 섹션으로 올려 상위 6개를 고른다
6. 문서를 <documents> 태그에 넣어 Gemma 4가 마크다운으로 답한다 — 사실 하나면 1~2문장, 기능·단계처럼 여러 항목이면 한 줄 요지와 글머리표 목록. 마지막 줄에 [[slug]] 출처를 단다. 챗 화면은 마크다운을 HTML로 해석하지 않고 정해진 형식(목록·굵게·코드)만 화면 요소로 그린다
7. 실제로 넣은 문서의 slug만 출처 칩으로 인정한다

청킹은 부모(## 섹션, 최대 1,500자)와 자식(300~500자)의 2단계다. 리랭크는 한국어 구분을 못 해 꺼 두었다.

## 문서 넣기 파이프라인

챗이 아는 내용은 src/content/rag/의 마크다운 문서와 프로젝트 상세 본문뿐이다.

1. 가져오기(pnpm rag:import): PDF나 마크다운 원본 → 파서 레지스트리 → 검토용 마크다운 초안. 원본은 R2 sources/에(비공개), 문서 이미지는 R2 media/에 올리고 본문에는 /media/{해시} URL을 넣는다. 스캔 쪽은 쪽 이미지로만 넣는다(OCR은 2차)
2. 검토: 사람이 초안을 읽고 고친 뒤(순서·개인정보·대체 텍스트) 검토 표시를 지우고 커밋한다
3. 넣기(pnpm rag:build / rag:build:remote): 문서를 부모 섹션과 자식 청크로 나눠 D1 rag_sections·rag_chunks에 넣는다. id는 내용 해시라 바뀐 청크만 새 id가 된다. 검토 표시가 남은 문서가 있으면 운영 넣기는 멈춘다
4. 벡터 갱신: 배포된 Worker의 /admin/chat → 벡터 갱신이 D1 청크와 Vectorize를 비교해 새 청크만 임베딩하고 사라진 청크만 지운다. 넣은 id 목록은 KV에 둔다

/media/{해시}.{확장자} 요청은 Worker가 R2 media/에서 읽어 돌려주고, 형식이 다른 이름은 404다.

## 챗 가드레일

레포가 공개라 프롬프트 유출 자체는 피해로 보지 않는다. 막는 것은 남용·비용, 지어낸 사실·비방, 위조 이력, 위기 신호 누락이다.

1. 이력 서명: 서버가 답마다 HMAC 서명을 붙이고, 다음 요청에서 서명이 맞는 (질문, 답) 쌍만 이력으로 받는다
2. 태그 위조 방지: 사용자 글의 < >를 전각으로 바꾼다
3. 주입 검사: "이전 지시 무시", "시스템 프롬프트 보여줘" 같은 요청은 정규식으로 모델 없이 거절한다
4. 유해 검사: Llama Guard 3가 질문을 검사한다. 자해(S11)는 거절 대신 상담전화 안내다
5. 경로·범위 판단: 무관 작업은 슈퍼바이저가 off_task로 보내 고정 거절, 근거 없는 포트폴리오 질문은 레터 안내
6. 프롬프트 규칙: 문서 밖 사실·코드·번역·롤플레이·조언 금지, 섞인 요청은 포트폴리오 부분만
7. 출력 검사: 코드 블록이 나오면 끊고, 출처 표기가 6개를 넘으면 끊는다. 답은 300토큰 이하
8. 비용: 턴 제한, 월 토큰 상한, 질문 500자

## 데이터 저장소: D1 테이블, KV 키, R2

D1 테이블:
- user·session·account·verification: Better Auth가 관리. user에 is_blocked·is_admin 추가. verification에 매직링크 토큰과 해시된 인증 코드. 로그인은 관리자만 한다
- letters: 레터 제목·본문·답장 주소(방문자가 입력)·언어·상태(sent·read·replied·failed)
- letter_replies: 관리자 답장
- chat_logs: 질문·재작성 질문·출처·검색 기록·가드 판정(flag)·경로(route)·토큰. 답변 본문 없음, IP는 해시, 90일
- rag_sections: 부모 섹션(모델에 넣는 단위), 쪽 번호·이미지 URL 포함
- rag_chunks: 자식 청크(검색 단위) + FTS5 색인. id가 Vectorize id

KV 키: ml:ip·ml:email(로그인 메일 요청 제한), otp:ip(코드 입력 제한), stats:login:{날짜}(일별 관리자 로그인 수), letter:ip:{해시}(IP별 레터 수), chat:ip:{해시}:{날짜}(IP별 턴 수), chat:month:{월}(누적 토큰), notify:*(알림 중복 억제), rag:vector-ids·rag:vector-synced(벡터 동기화 기록).

R2 portfolio-rag: sources/{해시}(원본, 비공개), media/{해시}(이미지, /media로 공개).

마이그레이션은 Drizzle Kit으로 만들고 wrangler d1 migrations apply로 적용한다(0000~0006).

## 비용과 한도

- Workers AI는 하루 10,000뉴런까지 무료다. 포트폴리오 질문 1턴은 유해 검사 + 슈퍼바이저 + 임베딩 + 답변이고, 잡담·연락·무관 작업은 답변 호출이 없다. 슈퍼바이저는 1회 약 10뉴런(11/03 실측)
- 앱 자체 상한: IP 해시당 하루 20턴(넘으면 "오늘은 여기까지예요(하루 20번). 레터로 이어가요." + 레터 버튼), 사이트 전체 하루 턴 상한, 월 토큰 상한 기본 2,000,000(CHAT_MONTHLY_TOKEN_CAP). 상한에 닿으면 "오늘은 쉬어요" + 레터 버튼, Telegram 알림
- Workers AI 호출이 한도·오류로 실패해도 같은 고정 응답으로 끝난다
- 레터: IP 해시당 24시간 3통, 사이트 전체 하루 상한 LETTER_DAILY_CAP. 관리자 로그인 메일: IP당 10분 3회, 같은 이메일 10분 1회
- 그 밖의 서비스(D1·KV·R2·Vectorize)는 이 규모에서 무료 범위다

## 개발과 운영 방식

- 설계 우선: docs/에 단계별 설계 문서가 있고, 구현 전에 문서를 읽는다. 설계와 코드가 어긋나면 코드를 바꾸기 전에 문서를 먼저 고친다
- 단계 완료 기준: 각 단계 문서의 완료 기준을 통과해야 다음 단계로 간다
- 1인 운영: PR 없이 main에 커밋하고, 푸시 전 로컬 pnpm build가 통과해야 한다
- 배포: 로컬 wrangler CLI로만(pnpm run deploy). 챗 독 노출은 빌드 플래그 PUBLIC_CHAT_ENABLED, API 열기는 Worker 시크릿 CHAT_ENABLED
- 운영 알림: 새 레터, 메일 실패, 5xx, 챗 상한·가드 차단을 Telegram으로 받는다. 모니터링은 Cloudflare 기본 로그
- 구현은 Claude Code가 하고, yhy는 프로세스를 이해하고 판단한다

## 브라우저 지원

지원 범위는 Safari·iOS 16.4 이상, Chrome 111 이상이다(Tailwind v4의 최소 요구). 11/03 전수 점검에서 Chromium(데스크톱, iPhone 크기, Android 소형)은 실제 브라우저로 확인했고, Safari·iOS는 코드와 빌드 결과로 점검했다. iOS 16의 Popover API 부재, 시트 배경 스크롤, 앱 안 브라우저의 Google 로그인 차단, 키보드가 떴을 때 화면 밀림 같은 Safari 특유 문제를 고쳤다. 실기기 확인 목록은 docs/guides/browser-support.md에 있다.
