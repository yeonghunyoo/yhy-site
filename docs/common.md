# 공통 · 데이터 모델 · 환경변수 · 보안

2단계 이후 모든 단계가 참조한다.

## 데이터 모델 (D1)

Better Auth가 만드는 4개 테이블 위에 서비스 테이블을 얹는다(1차 2개, 2차 3개). 마이그레이션은 Drizzle Kit, `wrangler d1 migrations apply`로 적용.

**Better Auth 관리**: `user`, `session`, `account`(Google 연결), `verification`(매직링크 토큰). 스키마는 라이브러리 CLI가 생성하며 손대지 않는다. `user`에 `is_blocked INTEGER DEFAULT 0`과 `is_admin INTEGER DEFAULT 0`(11/04, 지정 관리자 — [04-admin.md](04-admin.md) "관리자 지정")만 추가 컬럼으로 둔다.

**서비스 테이블**

| 테이블 | 컬럼 | 비고 |
| --- | --- | --- |
| `letters` | `id`, `user_id`, `subject`, `body`, `reply_to`, `locale` (ko/en, 답장 메일 언어), `status` (sent/read/replied/failed), `resend_id`, `read_at`, `created_at` | `user_id` nullable(계정 삭제 시 NULL), 인덱스. 하루 3통 검사는 `created_at` 범위 count |
| `letter_replies` | `id`, `letter_id`, `body`, `resend_id`, `status` (sent/failed), `created_at` | 답장 1회 원칙이지만 재전송 대비 1:N 구조. `letter_id` 인덱스 |
| `chat_logs` (2차) | `id`, `user_id` nullable, `ip_hash`, `locale`, `question`, `rewritten`, `sources` (JSON), `retrieval` (JSON: 부모 id·점수), `tokens_in`, `tokens_out`, `created_at` | 답변 본문 저장 안 함, IP는 해시만 |
| `rag_sections` (2차) | `id`(해시), `slug`, `locale`, `kind`(doc/faq), `title`, `heading`, `text`, `position` | 부모 — 모델에 넣는 단위 |
| `rag_chunks` (2차) | `id`(해시), `section_id`, `slug`, `locale`, `kind`, `text` | 자식 — 검색 단위. FTS5 `rag_chunks_fts` 동기 트리거, id = Vectorize id. 상세는 [05-06-chat-rag.md](05-06-chat-rag.md) |

**KV 키**

| 키 | 값 | TTL |
| --- | --- | --- |
| `ml:ip:{ip}` | 매직링크 요청 횟수 | 10분 |
| `ml:email:{email}` | 1 | 10분 |
| `stats:login:{YYYY-MM-DD}` (KST) | 그날 로그인(세션 생성) 수 | 31일 |
| `notify:5xx:{YYYY-MM-DDTHH:MM}` | 5xx 알림 중복 억제 | 2분 |
| `chat:ip:{IP 해시}:{YYYY-MM-DD}` (2차) | 턴 수(11/04 로그인 없이 IP당 20) | 1일 |
| `letter:ip:{IP 해시}` | 레터 수(IP당 하루 3, 11/04) | 24시간 |
| ~~`chat:month:{YYYY-MM}`~~ | (11/03 폐지 — 월 토큰은 D1 `chat_logs` 합계, [guides/cost-guard.md](guides/cost-guard.md)) | — |
| `budget:mail:{YYYY-MM-DD}` / `budget:mail:{YYYY-MM}` (KST) | 보낸 메일 수(일·월 상한) | 26시간 / 32일 |
| `budget:alert:{날짜}:{종류}:{단계}` | 사용량 80%·100% 알림을 하루 1번만 | 26시간 |
| `block:{IP 해시}` | 요청 폭주 IP 10분 차단 | 10분 |
| `notify:chat-guard:{YYYY-MM-DDTHH}` (2차) | 챗 가드 알림 중복 억제(UTC 시간 단위) | 2시간 |
| `rag:vector-ids` (2차) | Vectorize에 넣은 청크 id 목록(JSON) | 없음 |
| `rag:vector-synced` (2차) | 마지막 벡터 갱신 시각·추가·삭제 수 | 없음 |

**보존 정책**: 레터·답장은 영구(계정 삭제 시 `user_id`·`reply_to`만 NULL), `chat_logs`는 90일 지난 행을 챗 요청 때 함께 삭제(cron 없음, [05-06-chat-rag.md](05-06-chat-rag.md)).

## 환경변수·비밀

레포가 Public이므로 비밀은 전부 Worker 시크릿에만 두고, 로컬은 `.dev.vars`(gitignore)로 쓴다.

- 운영 비밀은 `.prod.vars`(gitignore)에 적어 두면 `pnpm run deploy`가 `wrangler deploy --secrets-file`로 함께 올린다(10/29). 추가 방식이라 파일에 없는 비밀은 지워지지 않고 그대로 남는다. 빈 값(`KEY=`)이 있으면 운영 비밀을 덮어쓰지 않도록 배포가 멈춘다
- `.dev.vars`와 `.prod.vars`는 따로다. `.prod.vars`에는 운영에 넣을 비밀만 적고 `.dev.vars`를 통째로 복사하지 않는다(`BETTER_AUTH_URL=localhost`·`CHAT_ENABLED` 같은 로컬 값이 운영을 덮는다). Google OAuth 클라이언트는 로컬·운영 공용이라 그 두 값만 같다
- dotenv 형식이라 값 안의 `$`는 `\$`로 쓴다. 같은 이름의 셸 환경변수가 있으면 파일 값보다 우선한다
- `wrangler secret put`도 쓸 수 있지만 값 입력 프롬프트가 필요해 별도 터미널에서 실행한다(Claude Code의 `!`에서는 빈 값이 들어갈 수 있다)

| 변수 | 용도 | 1차 필요 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | 세션 서명 | 예 |
| `BETTER_AUTH_URL` | 운영 도메인 | 예 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth | 예 |
| `RESEND_API_KEY` | 메일 발송 | 예 |
| `MAIL_FROM` | `letters@{도메인}` | 예 |
| `LETTER_TO` | 내 수신 메일 | 예 |
| `ADMIN_EMAILS` | 쉼표 구분 허용목록 | 예 |
| `CHAT_MONTHLY_TOKEN_CAP` | 월 상한(기본 2,000,000) | 2차 |
| `AI_DAILY_NEURON_CAP` · `CHAT_DAILY_TURN_CAP` · `MAIL_DAILY_CAP` · `MAIL_MONTHLY_CAP` · `LETTER_DAILY_CAP` | 사이트 전체 일일·월 상한(비우면 기본값, [guides/cost-guard.md](guides/cost-guard.md)) | 11/03 |
| `KILL_LOGIN_MAIL` · `KILL_LETTERS` | 긴급 차단 스위치(1이면 중지) | 11/03 |
| `CF_ANALYTICS_TOKEN` · `CF_ACCOUNT_ID` | `/admin/usage`의 Cloudflare 통계(분석 읽기 전용 토큰) | 11/03 |
| `CHAT_ENABLED` | `1`이면 `/api/chat` 열림 | 2차 |
| `RAG_SYNC_TOKEN` | 벡터 갱신 API(`POST /api/admin/rag/reindex`)를 관리자 세션 없이 부르는 토큰(32바이트 이상 무작위). 운영 비밀 + 로컬 `.prod.vars`(배포·`rag:sync:remote`가 읽는다). 비우면 세션으로만 | 11/04 |
| `CHAT_MODEL` | 답변 모델 덮어쓰기(비우면 `src/lib/server/ai.ts` 기본값) — 모델 비교용 | 2차, 선택 |
| `PUBLIC_CHAT_ENABLED` | 빌드 플래그 — `1`이면 챗 독 노출(`.env` 또는 배포 명령 앞). `pnpm run deploy`는 기본 `1`, 끄려면 `0` | 2차 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 레터·에러·삭제 알림 | 예 |
| `SITE_NAME` | 메일 제목 접두어 | 예 |

바인딩(`wrangler.jsonc`): D1 `DB`, KV `KV`, (2차) Vectorize `VEC`, Workers AI `AI`, R2 `R2`(버킷 `portfolio-rag` — RAG 원본 `sources/`(비공개)와 이미지 `media/`(`/media/*`로 서빙), 로컬·운영 공용 `remote: true`, 11/02 승인, 설계 [06-ingest.md](06-ingest.md)). D1·KV id는 운영 리소스 것이다(2026-10-29 생성). `SITE_NAME`·`BETTER_AUTH_URL`은 비밀이 아니라 `vars`에 두고, 로컬은 `.dev.vars` 값이 우선한다.

로컬: `.dev.vars.example`을 복사해 `.dev.vars`를 만든다. 운영: `.prod.vars.example`을 복사해 `.prod.vars`를 만든다. 마이그레이션은 `pnpm db:generate`(Drizzle Kit) → `pnpm db:migrate:local` / `pnpm db:migrate:remote`.

## 보안 체크리스트

- [x] `.dev.vars`, `.prod.vars`, `.wrangler/`가 `.gitignore`에 포함
- [x] 모든 `/api/*`는 세션 또는 레이트리밋 중 하나 이상 통과해야 응답
- [x] 레터 본문은 HTML 이스케이프 후 메일 템플릿에 삽입 (XSS·메일 인젝션 방지)
- [x] CSP: `default-src 'self'`, 폰트·이미지 출처 명시. 정적 페이지라 nonce 대신 Astro `security.csp`의 해시를 `<meta>`로
- [x] `/admin` 미인가는 404 (401/403 아님)
- [x] 관리자 지정(`is_admin`)은 관리자만, 자기 자신·최고 관리자(`ADMIN_EMAILS`)는 바꿀 수 없고, 지정·해제마다 Telegram 알림(11/04)
- [x] Google OAuth 리디렉션 URI는 등록한 주소만 — 로컬(`localhost:8787`)과 운영(workers.dev, 도메인 연결 후 그 주소). 클라이언트는 로컬·운영 공용 1개(10/29, [02-auth.md](02-auth.md))
- [x] 레이트리밋 키의 IP는 `CF-Connecting-IP` 사용
- [ ] Cloudflare 무료 WAF 규칙으로 `/api/*` 국가별·봇 점수 기반 챌린지 (선택)
- [x] 개인정보 고지: 레터의 답장 이메일·내용 저장 사실을 레터 시트 하단에 한 줄 명시(11/04 방문자 로그인 없앰)
- [x] ~~`DELETE /api/account`는 세션 + 확인 문자열 둘 다 검증, 트랜잭션(D1 batch)으로 처리~~ — 11/04 엔드포인트 삭제(방문자 계정 없음)
- [x] `/api/admin/*`는 관리자 세션 검증을 미들웨어와 핸들러 양쪽에서 수행. 예외는 `POST /api/admin/rag/reindex` 하나로, `RAG_SYNC_TOKEN` Bearer를 상수 시간 비교로 확인한다(11/04, 미들웨어·핸들러 양쪽)
- [x] Telegram 메시지에 방문자 이메일 전체를 넣지 않는다(앞 3자 + 도메인만)
- [x] (2차) 챗 가드레일: 이력 서명, 태그 이스케이프, 주입 검사, Llama Guard 유해 검사(자해는 도움 안내), 범위 판단, 출력 검사 — [05-06-chat-rag.md](05-06-chat-rag.md) "보안·가드레일"
- [ ] (2차, 선택) Cloudflare WAF 속도 제한 규칙으로 `/api/chat` IP당 분당 요청 제한

## 접근성 (전 단계)

- 키보드 포커스 순서, 스크린리더 레이블, 색 대비 4.5:1
