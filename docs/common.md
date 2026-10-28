# 공통 · 데이터 모델 · 환경변수 · 보안

2단계 이후 모든 단계가 참조한다.

## 데이터 모델 (D1)

Better Auth가 만드는 4개 테이블 위에 서비스 테이블 3개를 얹는다. 마이그레이션은 Drizzle Kit, `wrangler d1 migrations apply`로 적용.

**Better Auth 관리**: `user`, `session`, `account`(Google 연결), `verification`(매직링크 토큰). 스키마는 라이브러리 CLI가 생성하며 손대지 않는다. `user`에 `is_blocked INTEGER DEFAULT 0`만 추가 컬럼으로 둔다.

**서비스 테이블**

| 테이블 | 컬럼 | 비고 |
| --- | --- | --- |
| `letters` | `id`, `user_id`, `subject`, `body`, `reply_to`, `status` (sent/read/replied/failed), `resend_id`, `read_at`, `created_at` | `user_id` nullable(계정 삭제 시 NULL), 인덱스. 하루 3통 검사는 `created_at` 범위 count |
| `letter_replies` | `id`, `letter_id`, `body`, `resend_id`, `status` (sent/failed), `created_at` | 답장 1회 원칙이지만 재전송 대비 1:N 구조. `letter_id` 인덱스 |
| `chat_logs` (2차) | `id`, `user_id` nullable, `ip_hash`, `locale`, `question`, `sources` (JSON), `tokens_in`, `tokens_out`, `created_at` | 답변 본문 저장 안 함, IP는 해시만 |
| `rag_chunks` (2차) | `id`, `slug`, `locale`, `heading`, `text`, `vector_id` | FTS5 가상 테이블 `rag_chunks_fts(text)` 동기 트리거 |

**KV 키**

| 키 | 값 | TTL |
| --- | --- | --- |
| `ml:ip:{ip}` | 매직링크 요청 횟수 | 10분 |
| `ml:email:{email}` | 1 | 10분 |
| `chat:{userId 또는 ip}:{YYYY-MM-DD}` (2차) | 턴 수 | 1일 |
| `chat:month:{YYYY-MM}` (2차) | 누적 토큰 | 31일 |

**보존 정책**: 레터·답장은 영구(계정 삭제 시 `user_id`·`reply_to`만 NULL), `chat_logs`는 90일 후 월 1회 cron(Workers Cron Trigger)으로 삭제.

## 환경변수·비밀

레포가 Public이므로 비밀은 전부 Cloudflare 대시보드(또는 `wrangler secret`)에만 두고, 로컬은 `.dev.vars`(gitignore)로 쓴다.

| 변수 | 용도 | 1차 필요 |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | 세션 서명 | 예 |
| `BETTER_AUTH_URL` | 운영 도메인 | 예 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth | 예 |
| `RESEND_API_KEY` | 메일 발송 | 예 |
| `MAIL_FROM` | `letters@{도메인}` | 예 |
| `LETTER_TO` | 내 수신 메일 | 예 |
| `ADMIN_EMAILS` | 쉼표 구분 허용목록 | 예 |
| `ANTHROPIC_API_KEY` | Haiku | 2차 |
| `CHAT_MONTHLY_TOKEN_CAP` | 월 상한 | 2차 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 레터·에러·삭제 알림 | 예 |
| `SITE_NAME` | 메일 제목 접두어 | 예 |

바인딩(`wrangler.toml`): D1 `DB`, KV `KV`, (2차) Vectorize `VEC`, Workers AI `AI`.

## 보안 체크리스트

- [ ] `.dev.vars`, `.wrangler/`가 `.gitignore`에 포함
- [ ] 모든 `/api/*`는 세션 또는 레이트리밋 중 하나 이상 통과해야 응답
- [ ] 레터 본문은 HTML 이스케이프 후 메일 템플릿에 삽입 (XSS·메일 인젝션 방지)
- [ ] CSP 헤더: `default-src 'self'`, 폰트·이미지 출처 명시, 인라인 스크립트는 nonce
- [ ] `/admin` 미인가는 404 (401/403 아님)
- [ ] Google OAuth 리디렉션 URI에 운영 도메인만 (로컬은 별도 클라이언트)
- [ ] 레이트리밋 키의 IP는 `CF-Connecting-IP` 사용
- [ ] Cloudflare 무료 WAF 규칙으로 `/api/*` 국가별·봇 점수 기반 챌린지 (선택)
- [ ] 개인정보 고지: 로그인 이메일·레터 저장 사실을 레터 시트 하단에 한 줄 명시
- [ ] `DELETE /api/account`는 세션 + 확인 문자열 둘 다 검증, 트랜잭션으로 처리
- [ ] `/api/admin/*`는 관리자 세션 검증을 미들웨어와 핸들러 양쪽에서 수행
- [ ] Telegram 메시지에 방문자 이메일 전체를 넣지 않는다(앞 3자 + 도메인만)

## 접근성 (전 단계)

- 키보드 포커스 순서, 스크린리더 레이블, 색 대비 4.5:1
