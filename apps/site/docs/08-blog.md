# 8단계 · 블로그 (Notion으로 쓰고 R2에서 읽는다)

2026-11-10 설계. 결정 [S-017](decisions.md)(S-016 제안을 확정·수정). 글은 Notion에서 쓰고, **동기화**가 공개 글과 사진을 R2 `blog/`로 옮기고, 사이트는 **요청 때** R2에서 읽는다. 글 하나 올릴 때 빌드·배포를 돌리지 않으면서 SEO(정적 페이지와 같은 메타·구조화 데이터·sitemap)는 그대로 지킨다.

## 왜 이 구조인가

| 문제 | 해결 |
| --- | --- |
| Notion 파일 이미지 주소는 서명돼 1시간 뒤 만료 — 그대로 쓰면 사진이 깨진다 | 동기화가 내려받아 webp로 줄여 R2 `blog/img/`에. 글 HTML의 주소를 우리 주소로 바꾼다 |
| Notion을 요청마다 부르면 API 한도(초당 약 3회)·속도·장애가 사이트에 그대로 온다 | 사이트는 Notion을 부르지 않는다. R2만 읽는다 |
| 글마다 전체 빌드·배포는 과하다(사용자, 11/10) | 페이지는 요청 때 R2에서 그린다(SSR) + 엣지 캐시. 동기화만 하면 1분 안에 반영 |
| SEO는 지켜야 한다 | `BaseLayout`을 그대로 쓴다(SSR도 같은 `<head>`). `BlogPosting` JSON-LD, 블로그 전용 sitemap(요청 때 생성), 동기화 뒤 운영 주소로 SEO 점검 |
| 회사 문서·이력서(전화번호·생년월일)가 Notion에 같이 있다 | Notion 통합은 "블로그 글" DB 하나에만 공유하고, 그중 **공개** 체크한 글만 가져온다 |

## 흐름

```
Notion "블로그 글" DB ──(pnpm site blog:sync)──▶ R2 blog/ ──(요청 때 읽기 + 엣지 캐시)──▶ /{locale}/blog/…
   공개 체크한 글만            마크다운 → HTML(정리) ·            index.json · posts/*.json · img/*.webp
                               이미지 내려받기 → webp
```

## Notion

- 페이지 "bettercurl 블로그"(비공개) 안의 DB **블로그 글** — `collection://2fead265-afa2-40ab-ac6a-54e1ffabcb75`
- 속성: `제목`(title) · `slug`(영문 소문자·숫자·하이픈) · `언어`(ko/en) · `공개`(체크박스) · `요약`(ko 40~120자, en 70~170자) · `발행일` · `태그` · `수정일`(자동)
- 같은 글의 한국어·영어판은 **slug를 같게** — 프로젝트(`{slug}.{locale}.md`)와 같은 규칙. 한 언어뿐이면 hreflang에서 뺀다
- 토큰: Notion "내부 통합"(Read content만)을 만들어 이 DB에만 연결. 동기화하는 곳에만 둔다 — 로컬 `apps/site/.env`의 `NOTION_TOKEN`, 클라우드 세션은 환경의 네트워크 비밀(`api.notion.com`에 헤더 주입 — 코드·레포에 값이 없다). Worker에는 넣지 않는다
- DB id는 `wrangler.jsonc`가 아니라 동기화 스크립트 설정(`NOTION_BLOG_DB`, 기본값은 위 id)

## 동기화 — `scripts/blog-sync.mjs` (`pnpm site blog:sync`)

로컬·클라우드 세션에서 돈다(Node — 이미지 변환에 `sharp`가 필요해 Worker에서는 하지 않는다).

1. DB에서 `공개` = 체크인 글 목록(제목·slug·언어·요약·발행일·태그·수정일)
2. 글마다 `GET /v1/pages/{id}/markdown`(`Notion-Version: 2026-03-11`, `markdown_version=v2`). `truncated`·`unknown_block_ids`가 있으면 경고하고 그 글은 건너뛴다(반쯤 잘린 글을 내보내지 않는다)
3. **Notion식 마크다운 → 표준 마크다운**: `<image source caption>` → 그림+캡션, `<callout>` → 인용 상자, `<columns>` → 차례로 펼침, `<b>`·`<i>`·`<code>` → 마크다운, `<p />` → 빈 줄, `<page>`·`<database>`·멘션 → 글자만. 모르는 태그는 버리고 경고
4. **이미지**: 서명 주소에서 내려받아 `sharp`로 긴 변 1600px webp, 이름은 내용 해시(`blog/img/{sha256 앞 32자}.webp`). 크기(width·height)를 같이 기록한다(CLS)
5. **HTML로 그리기**: `remark-gfm`(표) → `rehype-sanitize`(허용 태그만, `style`·`on*` 속성 금지 — CSP) → 제목에 id(목차). 첫 이미지만 `fetchpriority="high"`, 나머지 `loading="lazy"`
6. **점검(올리기 전)**: slug 형식, 요약 길이, 제목 중복, 이미지 alt(캡션 없으면 경고), 같은 slug·언어 중복 → 오류면 그 글은 올리지 않는다
7. **R2에 쓰기**(wrangler r2 object put, 운영 버킷 `portfolio-rag`): 바뀐 것만
   - `blog/posts/{slug}.{locale}.json` — `{ meta, html, toc, images }`
   - `blog/img/{hash}.webp`
   - `blog/index.json` — 공개 글 목록 + `version`(동기화 시각). 마지막에 쓴다(글·사진이 먼저 올라간 뒤 목록이 바뀐다)
   - 공개가 풀린 글은 index에서 빠지고 `posts/` 파일은 지운다. 사진은 남긴다(다른 글이 쓸 수 있다 — 정리는 2차 `blog:img:gc`)
8. **점검(올린 뒤)**: 운영 주소로 새·바뀐 글을 받아 `seo-check`와 같은 규칙으로 확인(`scripts/seo-check.mjs --url`). 이미 올라간 뒤라 막지는 않고 보고만

## 사이트(Worker)

| 경로 | 무엇 | 캐시 |
| --- | --- | --- |
| `/{locale}/blog/` | 글 목록(그 언어 글, 발행일 최신순) | 엣지 10분 + index `version`이 바뀌면 새로 |
| `/{locale}/blog/{slug}/` | 글. `BaseLayout`(`type="article"`, `available` = 그 slug가 있는 언어), 본문 HTML, 목차 | 위와 같다 |
| `/blog/img/{hash}.webp` | R2 `blog/img/` — 이름이 내용 해시라 영구 캐시(`immutable`) + Cache API | 영구 |
| `/sitemap-blog.xml` | 공개 글(언어별 `<url>`, `xhtml:link`, `lastmod` = Notion 수정일) | 엣지 10분 |

- 읽기: `src/lib/server/blog.ts` — `index.json`은 Cache API에 60초(R2 읽기를 줄인다), 글은 `{url}#{version}` 키로 Cache API. 동기화하면 `version`이 바뀌어 늦어도 60초 뒤 새 글
- 없는 글·공개 해제된 글은 404(`noindex`). index에 있는데 R2 파일이 없으면 404 + 로그
- `robots.txt`에 `Sitemap: /sitemap-blog.xml` 한 줄 더. `llms.txt`(정적)에는 블로그 목록 주소만 둔다
- JSON-LD `BlogPosting`(headline·description·datePublished·dateModified·inLanguage·image·author → `/#person`·isPartOf → `/#website`), 목록은 `Blog`
- OG 이미지: 글의 첫 이미지(없으면 사이트 기본)
- 머리말에 "블로그" 링크(ko 블로그 / en Blog). 홈 "최근 글"은 글이 3편 넘으면
- 요청 방어: `/blog/img/*`는 R2를 읽으므로 Cache API에서 대부분 끝난다. 순간 제한 목록에는 넣지 않는다(KV 쓰기 규칙) — 비용을 보고 2차에 판단
- CSP: 본문은 동기화에서 정리한 HTML이라 인라인 스타일·스크립트가 없다. 이미지는 같은 출처(`'self'`)

## 사진 용량

- Notion 무료 플랜은 **파일 하나당 5MB**(유료 5GB) — 화면 캡처는 넉넉, 휴대폰 원본 사진은 줄이거나 JPG로 올린다(또는 이미지를 링크로 넣으면 그 주소에서 내려받는다)
- 동기화: 원본 20MB 넘으면 건너뛰고 경고. 긴 변 1600px webp 품질 80, 결과가 1MB 넘으면 품질 65로 다시. 이름은 결과의 내용 해시 → 같은 사진은 한 번만 저장·올림
- 동기화 끝에 R2 `blog/` 사진 총량과 무료 10GB 대비 %를 출력한다(index.json `images`에 장마다 크기 기록)

## 비용

R2 읽기(Class B, 무료 월 1천만)는 index 60초 캐시 + 글·사진 엣지 캐시로 방문 수보다 훨씬 적다. Worker 호출은 페이지·사진 요청마다 센다(무료 하루 10만, 지금 페이지 요청도 이미 Worker를 거친다 — S-014). 쓰기(Class A)는 동기화 때만.

## 구현 (11/10)

| 파일 | 무엇 |
| --- | --- |
| `scripts/blog/convert.mjs` | Notion식 마크다운 → 정리된 HTML(태그 변환·제목 단계 내림·이미지 바꾸기·허용 태그만·목차·바깥 링크 noopener), 메타 점검 |
| `scripts/blog/convert-check.mjs` · `fixture.md` | 변환 시험 18개(`pnpm test`) |
| `scripts/blog-sync.mjs` | `pnpm blog:sync [--dry\|--local\|--fixture]` — Notion API(`data_sources/{id}/query`, `pages/{id}/markdown`) → 변환 → sharp webp → `wrangler r2 object put`. Notion 수정 시각이 같으면 건너뛴다, 공개 해제는 글 파일 삭제 |
| `src/lib/server/blog.ts` | R2 `blog/index.json`(isolate에 60초) · `posts/{slug}.{locale}.json` 읽기 |
| `src/pages/[locale]/blog/index.astro` · `[slug].astro` | 목록·글(SSR). `BaseLayout`에 `image`(첫 사진 → OG), `available`(그 slug의 언어) |
| `src/pages/blog/img/[file].ts` · `src/pages/sitemap-blog.xml.ts` | 사진(영구 캐시) · 블로그 sitemap(lastmod) |
| `src/lib/edge-cache.ts` + `src/worker.ts` | 블로그 목록·글 60초, sitemap 5분, 사진 1년 Cache API |
| `src/lib/jsonld.ts` | `Blog`·`BlogPosting` |
| `scripts/seo-check.mjs --url` | 블로그 sitemap 주소를 받아 같은 SEO 규칙 + robots의 sitemap-blog 줄 |
| 그 밖 | 머리말 "블로그" 링크, robots.txt 두 번째 Sitemap, `llms.txt` 블로그 줄, 언어 전환은 다른 언어판이 없으면 그 언어 홈(404 포함) |

**로컬 확인**(토큰 없이): `pnpm build` → `pnpm blog:sync --fixture --dry`(결과 `.wrangler/tmp/blog/`) → `dist/server/wrangler.json`에서 `remote`를 뺀 설정으로 로컬 R2에 넣고(`wrangler r2 object put … --local --persist-to <dir>`) `wrangler dev -c <그 설정> --persist-to <dir>` → `/ko/blog/fixture-test/`. `pnpm seo:check --url http://localhost:8787`. 11/10 확인: 목록·글·사진 200, 없는 글·영어판 없는 글 404, `/ko/blog` 301, sitemap·robots·`BlogPosting`·OG 이미지, `--url` 점검 오류 0

**운영 순서**: 배포(코드) → Notion 토큰 → 첫 글 공개 → `pnpm blog:sync` → `pnpm seo:check --url https://bettercurl.dev` → Search Console에 `/sitemap-blog.xml` 제출. 글이 없을 때 배포하면 머리말 "블로그"가 빈 목록("아직 글이 없어요")으로 간다 — 첫 글과 함께 배포하는 게 낫다

## 완료 기준

- [ ] Notion에 글을 쓰고 공개 체크 → `pnpm site blog:sync` → 1분 안에 `/ko/blog/{slug}/`에 보인다(배포 없음)
- [ ] 사진이 R2 주소로 나오고 하루 뒤에도 깨지지 않는다
- [ ] 공개를 풀고 동기화 → 404, sitemap에서 빠진다
- [ ] 글 페이지가 `seo-check` 규칙을 통과(`--url`), 리치 결과 테스트에서 `BlogPosting` 인식
- [ ] `/sitemap-blog.xml`이 robots.txt에 있고 Search Console에 제출
- [ ] 회사·이력서 페이지는 통합이 읽을 수 없다(공유 안 함)

## 2차

- 어드민 "동기화" 버튼(이미지 변환을 Worker 밖에서 할 방법이 정해지면 — 예: 원본 그대로 저장 또는 Cloudflare Images)
- `blog:img:gc`(아무 글도 안 쓰는 사진 지우기), 홈 "최근 글", 태그 목록 페이지, RSS(`/{locale}/blog/rss.xml`)
- 글을 챗 RAG 문서에 넣을지
