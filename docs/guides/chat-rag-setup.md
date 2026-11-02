# 챗 + RAG 연동 가이드 (5–6단계)

작성 2026-10-29, 11/01 Workers AI 전환 반영. 설계는 [05-06-chat-rag.md](../05-06-chat-rag.md).

## 지금 상태 (11/01 저녁, 운영은 원격 조회로 확인)

**한 줄**: 코드·가드레일·평가 도구는 끝났고 초안 문서로 로컬에서 측정까지 했다. 실제 문서 소스를 기다리는 중이라 운영에는 켜지 않았다.

| 항목 | 상태 |
| --- | --- |
| 챗 독 UI, SSE 스트리밍, 턴 제한(비로그인 3 / 로그인 30, KST 하루), 월 토큰 상한 | 동작 |
| 넣기: 부모-자식 청킹, 해시 id, FAQ (`pnpm rag:build`, `--dry`로 미리보기) | 동작 — 로컬 D1에 초안 문서 24섹션/24청크 |
| 가져오기: PDF·마크다운 → 검토용 마크다운 + 이미지 R2 (`pnpm rag:import`, [06-ingest.md](../06-ingest.md)) | 동작(11/02) — R2 실제 업로드는 버킷 생성 후 확인 |
| 질문 파이프라인: 재작성 → 병렬 검색(RRF) → 범위 판단 → 부모 섹션 top-6 → Workers AI 답변 | 동작 (로컬, Gemma 4 26B) |
| 벡터 갱신(바뀐 것만), 검색 전용 `GET /api/admin/rag/search`, 기준 질문 평가 `/admin/chat?eval=1` | 동작 |
| 리랭크 | 코드는 있고 꺼 둠(한국어 구분 못 함) |
| 가드레일: 이력 서명, 주입 검사, Llama Guard, 출력 검사, 공격 질문 점검 `/admin/chat?redteam=1` | 동작 (로컬) |
| Vectorize 인덱스 `portfolio-rag`, `ai`·`vectorize` 바인딩 | 있음 (11/01) — 인덱스는 로컬·운영 공용 |
| 기준 질문 평가 | 초안 문서 10개로 재현율 100%, 범위 밖 거절 100% (로컬) |
| 운영 D1 마이그레이션 0002~0004 | 적용됨 (`wrangler d1 migrations list --remote` → 남은 것 없음) |
| 운영 청크 (`rag_sections` / `rag_chunks`) | **0 / 0** — `rag:build:remote` 아직 안 함 |
| 운영 `CHAT_ENABLED` 비밀 | **없음** → `/api/chat`은 404 |
| 운영 노출 | **꺼져 있음** |

**남은 일**

1. 문서 소스 받기 → 초안 교체 (지금 `about`·`stack`에 `[확인 필요]`/`[TO CONFIRM]` 19곳, 아래 1번)
2. 받은 문서로 기준 질문 세트 15~20개 다시 만들기, 범위 기준 0.42 다시 재기(초안에서 날씨 질문이 0.386이라 여유가 작다), Gemma 4 / Qwen3 다시 비교
3. 확인 못 한 완료 기준: 턴 제한·월 상한, 실기기 키보드, 출처 칩 → 섹션 이동, 질문 로그 (아래 3번)
4. 추천 칩 문구·인사말 다듬기
5. 운영에 켜기 (아래 2-2) — 요청이 있을 때만

> **주의 — 로컬 `.env`의 `PUBLIC_CHAT_ENABLED=1`**: `pnpm run deploy`는 `astro build`가 `.env`를 읽으므로, 이 줄이 남아 있으면 챗을 켜기 전 배포에서도 운영 화면에 독 버튼이 나온다(API는 `CHAT_ENABLED`가 없어 실패). 챗을 켜기 전에 배포한다면 `.env`에서 이 줄을 빼 둔다.

## 1. 문서 (사람이 제공)

챗은 문서에 없는 경력·수치를 말하지 않도록 되어 있다. 그래서 문서가 곧 답의 한계다. 소스는 나중에 받는다.

- [ ] 문서 소스 받기 — 형식은 마크다운·PDF(11/01 결정)
  - 마크다운: `src/content/rag/{slug}.{ko|en}.md`에 그대로 넣는다. 섹션은 `##` 기준
  - PDF: `rag-sources/{slug}.{ko|en}.pdf`에 넣고(커밋 안 됨) `pnpm rag:import` → 원본·이미지가 R2에 올라가고 `.md` 초안이 생긴다 → 읽고 고친다(제목 위치, 표, 줄바꿈, 연락처·주소 같은 개인정보, 개인정보가 담긴 이미지는 줄째 삭제, 이미지 대체 텍스트 `그림 pN-M`을 내용으로, "지시문 의심" 줄) → 맨 위 `rag-import:` 주석을 지우고 커밋. 주석이 남아 있으면 `rag:build:remote`가 멈춘다
  - 처음 한 번: R2 버킷 `./node_modules/.bin/wrangler r2 bucket create portfolio-rag` — **버킷이 없으면 `pnpm run deploy`가 실패한다**(`wrangler.jsonc`에 R2 바인딩이 있다)
  - 스캔본 PDF는 글자가 없어 변환되지 않는다. OCR한 PDF나 마크다운으로 받는다
- [ ] 지금 초안 `about`·`stack`의 `[확인 필요]`/`[TO CONFIRM]` 자리는 받은 문서로 대체하거나 지운다
- [ ] 스택 경험 수준 표기 방식(예: 실무 / 개인 프로젝트 / 학습 중)
- [ ] FAQ `src/content/rag/faq.{ko,en}.md` — 자주 받을 질문과 답
- [ ] 기준 질문 세트 `src/content/rag/eval.json` — 질문과 나와야 할 slug
- [ ] 추천 칩 문구(`src/i18n/*.json`의 `chat.chips`)와 인사말, 페르소나·거절 규칙(`src/lib/server/chat.ts`의 `systemPrompt`)
- [ ] 문서를 고칠 때마다 `pnpm rag:build`(로컬) / `pnpm rag:build:remote`(운영) → `/admin/chat` 벡터 갱신

## 2. Cloudflare 설정

### 2-1. Vectorize 인덱스 + 바인딩 — 완료 (11/01)

인덱스는 `wrangler vectorize create portfolio-rag --dimensions=1024 --metric=cosine`으로 만들었고, `wrangler.jsonc`에 `ai`·`vectorize` 바인딩(둘 다 `remote: true`)을 넣었다. 바인딩을 바꾸면 `pnpm cf-typegen`.

- API 키가 필요 없다. 답변·재작성·임베딩·리랭크 모두 `AI` 바인딩 하나로 부른다
- `astro build`는 원격 연결을 열지 않는다(`astro.config.mjs`의 `remoteBindings`, 11/02) — 빌드 중 정적 페이지 생성은 AI·Vectorize를 쓰지 않으므로 Cloudflare 로그인 없이도 빌드된다. 배포된 Worker의 바인딩은 그대로다
- 로컬 `wrangler dev`(`pnpm preview`)도 AI·Vectorize는 원격을 쓴다 — 로컬 질문도 Workers AI 무료 범위에 잡히고, 로컬에서 벡터 갱신을 누르면 운영과 같은 인덱스가 바뀐다
- 무료 한도: Workers AI 하루 1만 뉴런, Vectorize 월 3천만 쿼리 차원 — 이 규모에선 여유. 계정이 무료 플랜이면 한도를 넘는 Workers AI 호출은 실패하고, 챗은 "오늘은 쉬어요"로 끝난다

### 2-2. 운영에 켜기

```bash
pnpm db:migrate:remote          # 챗·RAG 마이그레이션(0002~0004)
pnpm rag:build:remote           # 문서 → 운영 D1
./node_modules/.bin/wrangler secret put CHAT_ENABLED            # 값: 1
./node_modules/.bin/wrangler secret put CHAT_MONTHLY_TOKEN_CAP  # 선택, 예: 2000000
PUBLIC_CHAT_ENABLED=1 pnpm run deploy                          # 챗 독은 빌드 플래그가 있어야 화면에 나온다
```

배포 뒤 `/admin/chat` → **벡터 갱신**, 자식 수와 벡터 수가 같은지 확인.

두 개의 스위치가 있다: `PUBLIC_CHAT_ENABLED`(빌드 — 독 버튼 노출), `CHAT_ENABLED`(런타임 — API 열기). 끌 때는 `CHAT_ENABLED`를 지우면 API가 즉시 404가 된다.

## 3. 확인 (완료 기준)

- [ ] `/admin/chat` 기준 질문 평가 재현율 0.8 이상, 범위 밖 질문은 모델 호출 없이 거절 (초안 문서로는 11/01 둘 다 100%)
- [x] 답변 모델 비교(qwen3 30B vs gemma 4 26B) — 초안 문서로 Gemma 4를 골랐다(11/01). 실제 문서로 한 번 더 본다
- [x] 리랭크 켬/끔 비교 — 한국어 질문에서 점수 차이가 없어 껐다 (11/01)
- [ ] 5: 비로그인 3턴 뒤 로그인 안내, 로그인 30턴 뒤 레터 안내
- [ ] 5: 월 상한 도달 시 "오늘은 쉬어요" + Telegram `💸 챗 상한 도달`(상한을 잠깐 낮춰 확인)
- [ ] 5: 실기기(iOS Safari, Android Chrome)에서 키보드가 올라와도 입력창이 보인다
- [ ] 6: "RAG 어떻게 했어?"에 출처 칩이 달린 답, 칩을 누르면 해당 섹션으로 이동
- [ ] 6: 범위 밖 질문("오늘 날씨")에 레터 칩과 함께 정중히 거절
- [ ] 6: `/admin/chat` 공격 질문 점검 전부 통과 — 주입 거절, 유해 거절, 자해는 109 안내, 섞인 요청은 포트폴리오 부분만 (11/01 로컬 12/12)
- [ ] `/admin/chat`에 질문·재작성 질문·검색 점수가 쌓이고 답변 본문은 없다

## 4. 튜닝 메모

- 지금 값(`src/lib/server/rag.ts`의 `RAG`): 각 검색 top-24, RRF k=60, 범위 기준(최고 벡터 점수) 0.42, 키워드 밖 벡터 후보 0.35 이상, 부모 top-6, 질문 언어 1.2배, FAQ 1.1배
- 조정은 `GET /api/admin/rag/search`로 단계별 점수를 보고, `/admin/chat` 질문 로그로 실제 질문을 모아 기준 질문 세트에 더한다
- 재현율이 부족하면 부모마다 예상 질문 생성(빌드 때 한 번)을 켠다
- 출처는 답변의 `[[slug]]` 중 실제 넣은 문서만 인정한다(`citedSources`)
