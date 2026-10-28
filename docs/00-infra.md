# 0단계 · 인프라 (Cloudflare)

브라우저는 정적 자산을 Pages에서, 동적 요청은 Functions에서 받는다. Functions만 D1·KV·외부 서비스에 닿고, 비밀은 전부 Functions 쪽 환경변수에 있다. 구성도는 [overview.md](overview.md)에 있다.

## 사용 서비스

| 서비스 | 용도 | 무료 한도(요지) | 단계 |
| --- | --- | --- | --- |
| Registrar | 도메인 구매, 원가 판매 | — | 0 |
| DNS + 프록시 | 도메인 연결, TLS, 캐시, 무료 WAF | 무제한 | 0 |
| Pages | Astro 빌드·호스팅, PR 프리뷰 | 월 500 빌드 | 1 |
| Pages Functions | `/auth` `/api` `/admin` | 일 10만 요청 | 2 |
| D1 | 유저·세션·레터·(2차)챗 로그 | 5GB, 일 500만 읽기 | 2 |
| KV | 레이트리밋 카운터 | 일 10만 읽기, 1천 쓰기 | 2 |
| Email Routing | `letters@{도메인}` 수신을 개인 메일로 포워딩 (선택) | 무료 | 3 |
| Web Analytics | 쿠키 없는 방문 통계 (선택) | 무료 | 1 |
| Vectorize | RAG 벡터 인덱스 | 월 3천만 쿼리 차원 | 6 |
| Workers AI | 임베딩 모델 | 일 1만 뉴런 | 6 |

## 배포·로컬

**배포 흐름**: GitHub `main` 푸시 → Pages 자동 빌드(`pnpm build`) → 운영. PR은 프리뷰 URL 자동 생성. D1 마이그레이션은 배포 전 `wrangler d1 migrations apply`로 수동 적용(MVP는 CI 없이).

**로컬 개발**: `wrangler pages dev`로 D1·KV 로컬 에뮬레이션, 비밀은 `.dev.vars`.

## 0단계 작업 순서

1. 브랜드/도메인 확정 → Registrar에서 구매
2. GitHub Public 레포 생성(pnpm)
3. Pages 프로젝트 생성, 레포 연결, 빈 Astro 배포 확인
4. 커스텀 도메인 연결, HTTPS 확인
5. Web Analytics 켜기(선택)

**완료 기준**: 도메인으로 접속 시 "Hello" 페이지가 모바일·데스크톱에서 열린다.

## 본인이 직접 할 일

- [ ] 도메인 구매(Cloudflare 계정 결제 수단 등록)
- [ ] GitHub 레포 생성 및 Cloudflare Pages에 GitHub 앱 권한 부여
