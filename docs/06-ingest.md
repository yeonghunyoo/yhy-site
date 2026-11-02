# 6단계 보강 · 문서 수집 재설계 (docreader 참고)

**상태: 1~3단계 구현 (11/02), 4단계(스캔 쪽) 결정 대기.** R2 추가와 버킷 공용은 승인됨(11/02). 구현 메모는 맨 아래.

RAG에 넣을 원본(PDF, 나중에 docx·html 등)을 **검토할 마크다운**으로 바꾸고, 원본과 이미지는 R2에 저장해 이미지는 URL로 본문에 박는다. 그 뒤 청킹·임베딩은 지금의 `rag:build`가 이어받는다. 구조는 WeKnora `docreader`(Python gRPC 서비스)를 참고하되, 1인 사이트라 상시 서비스 대신 **로컬 CLI**로 옮긴다.

11/01의 `rag:import`(PDF 텍스트 → 마크다운 초안, `scripts/rag-import.mjs`)를 이 설계로 대체했다(11/02). 질문 파이프라인과 벡터 갱신은 바꾸지 않는다.

## 목표와 범위

| | MVP | 2차 |
| --- | --- | --- |
| 형식 | PDF(텍스트 있는 것), 마크다운 | docx, html, 이미지 파일 |
| 이미지 | PDF에 삽입된 이미지 추출 → R2 → `/media/…` URL | 벡터로 그린 도표 잘라내기, 이미지 설명 생성(비전 모델) |
| 스캔 쪽 | 쪽 이미지로 넣고 "글자 없음" 경고 | OCR(Workers AI 비전 모델) |
| 위치 | 청크에 쪽 번호 | 쪽 안 위치(bbox) |
| 검토 | 사람이 마크다운을 읽고 커밋(지금과 같음) | — |
| 업로드 화면 | 없음(CLI) | 필요해지면 어드민 |

## 전체 흐름

```
pnpm rag:import <파일|폴더> [--slug about --locale ko] [--force]
  ① 파서 선택(레지스트리, 확장자) → 실패하면 다음 파서(체인)
  ② 파싱 → ParseResult { markdown, images[], metadata, pages }
  ③ 원본 → R2 sources/{hash}.{ext}        (비공개, 서빙하지 않음)
     이미지 → R2 media/{hash}.{ext}        (공개, /media 경로로 서빙)
     본문의 임시 참조(images/p3-1.jpg) → /media/{hash}.jpg 로 교체
  ④ 초안 → src/content/rag/{slug}.{locale}.md
          (frontmatter에 출처, 쪽 표시 주석, 검토 표시 주석)
사람 검토 → 검토 표시를 지우고 커밋
pnpm rag:build[:remote]                    (지금 스크립트 + 아래 "넣기 변경")
  ⑤ 청킹: 표·이미지 줄 보호, 쪽 번호 메타, 이미지 URL은 섹션 메타로
  ⑥ D1 저장 → /admin/chat 벡터 갱신(지금과 같음)
사이트: GET /media/{hash}.{ext} → R2
```

## docreader와의 대응

| docreader | 이 설계 | 다르게 가는 이유 |
| --- | --- | --- |
| Python gRPC 서비스(`Read`, `ReadStream`) | Node CLI `scripts/ingest/` | 상시 서버가 필요 없고 Worker CPU 제한을 피한다 |
| `registry.py` + `base_parser.py` + `chain_parser.py` | `parsers/index.ts` 레지스트리, 확장자별 파서 배열(앞에서부터 시도) | 같음 |
| `ReadResponse { markdown_content, image_refs, metadata, source_blocks }` | `ParseResult { markdown, images, metadata, pages }` | `source_blocks`의 글자 위치 대신 **쪽 표시 주석**을 본문에 둔다 — 사람이 마크다운을 고쳐도 위치가 깨지지 않는다 |
| 이미지 저장은 파서 밖(Go 앱)에서 | 파서는 바이트만 반환, 저장·URL 교체는 `store.ts` | 같음 |
| PDF: pypdfium2, 쪽 분류(text/scanned), 삽입 이미지 필터, 도표 잘라내기 | PDF: `unpdf`(pdf.js) — 쪽 분류와 이미지 필터는 같은 기준, 도표 잘라내기는 2차 | pdf.js는 이미 쓰고 있고 Node에서 네이티브 없이 돈다 |
| 결과는 객체 저장소·DB | **확정 마크다운은 git**, 원본·이미지만 R2 | 검토 이력이 남고 "레포가 기준" 원칙과 맞다. 챗이 공개로 답하는 내용이라 공개 레포여도 된다 |
| 스플리터 512자/80자, 보호 패턴, 제목 붙이기 | 지금 부모-자식 청킹 유지 + 보호 패턴·쪽 메타 추가 | 제목 붙이기(`문서 > 섹션`)와 겹침은 이미 있다 |
| OCR·사진 보정(RapidOCR + Go VLM) | 2차, Workers AI 비전 모델 | — |

## 1. 파서 계약

```ts
// scripts/ingest/registry.mjs 머리 주석(스크립트가 .mjs라 타입은 주석으로 둔다)
interface ParseResult {
  markdown: string;            // 이미지는 임시 참조 ![](images/p3-1.jpg)
  images: ImageRef[];
  metadata: {
    title?: string;
    parser: string;            // 'pdf-unpdf' 등
    pageCount?: number;
    scannedPages?: number[];   // 글자가 없어 이미지로만 넣은 쪽
  };
}
interface ImageRef {
  ref: string;                 // 본문의 임시 참조와 같은 값
  data: Uint8Array;
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
  kind: 'embedded' | 'scanned_page';
  page?: number;               // 1부터
}
interface Parser {
  name: string;
  extensions: string[];        // ['.pdf']
  parse(file: Uint8Array, name: string): Promise<ParseResult>;  // 못 하면 throw → 체인의 다음 파서
}
```

- 쪽 위치는 본문에 `<!-- page:3 -->` 주석으로 넣는다(쪽이 바뀌는 자리마다). docreader `SourceBlock`의 쪽 locator에 해당한다
- 파서는 네트워크·R2를 모른다. 순수 함수라 `testdata/`의 PDF로 단위 테스트한다

## 2. PDF 파서 (`parsers/pdf.mjs`)

텍스트 처리는 지금 `rag-import.mjs`의 로직을 옮긴다(줄 묶기, 머리말·꼬리말 제거, 글자 크기로 `##` 제목, 문단·목록, 지시문 의심 표시). 추가하는 것:

**쪽 분류** (docreader `_route` 기준)
- 이미지가 쪽 면적의 50% 이상 → 스캔 쪽
- 글자 10자 미만이고 이미지가 10% 이상 → 스캔 쪽
- 그 밖은 텍스트 쪽

**삽입 이미지** (텍스트 쪽, `unpdf`의 `extractImages`)
- 남기는 조건: 쪽 면적 1% 이상, 가로·세로 80px 이상
- 버리는 것: 텍스트 쪽의 50% 이상에 같은 내용으로 나오는 이미지(로고·워터마크), 같은 쪽의 중복
- 문서당 최대 50개
- 쪽 본문 뒤에 위에서 아래 순서로 `![그림 p3-1](images/p3-1.jpg)`. 대체 텍스트는 자리표시라 검토 때 고친다

**스캔 쪽** (MVP)
- 쪽 전체를 JPEG로 그려 `![p5 스캔](images/p5.jpg)` 한 줄만 넣고 콘솔에 "글자 없음 — OCR은 2차" 경고
- 쪽 그리기는 `unpdf`의 `renderPageAsImage`(+ `@napi-rs/canvas`). 의존성이 부담되면 MVP에서는 경고만 하고 그 쪽을 건너뛴다(구현 때 결정)

**한계** (지금과 같음): 표·다단은 순서가 섞일 수 있고, 한국어 줄바꿈은 띄어 쓴다 → 검토에서 고친다.

## 3. 저장 (R2)

| 키 | 내용 | 공개 |
| --- | --- | --- |
| `sources/{sha256}.{ext}` | 원본 파일 | **비공개** — 서빙 경로 없음 |
| `media/{sha256}.{ext}` | 추출 이미지 | 공개 — `/media/{sha256}.{ext}` |

- 버킷: `portfolio-rag`(제안), 바인딩 `R2`. Vectorize처럼 `remote: true`로 로컬·운영이 같은 버킷을 쓴다(로컬 `pnpm preview`에서도 이미지가 보인다)
- 키가 내용 해시라 같은 이미지는 한 번만 올라가고, 이미 있으면 건너뛴다
- 업로드는 `wrangler r2 object put portfolio-rag/{key} --file … --remote` — API 키가 필요 없다(`wrangler login` 사용)
- 원본 보관은 재변환용이다. 로컬 `rag-sources/`(gitignore)는 그대로 두되, 다른 컴퓨터에서도 다시 변환할 수 있게 R2에도 둔다
- 무료 범위: 저장 10GB, 읽기 월 1천만 — 이 규모에선 여유

## 4. 초안 마크다운 형식

```md
---
title: 소개
source: { file: about.ko.pdf, hash: 3f2a…, parser: pdf-unpdf, pages: 4 }
---

<!-- rag-import: about.ko.pdf (4쪽)에서 자동 변환. 확인하고 이 주석을 지운다: ## 제목, 표, 줄바꿈, 개인정보, 이미지(개인정보가 담긴 이미지는 줄째 지운다), 지시문 -->

<!-- page:1 -->
## 누구인가
…
![그림 p1-1](/media/9c1e….jpg)

<!-- page:2 -->
…
```

- 같은 원본(`source.hash`가 같음)으로 이미 만든 `.md`가 있으면 `--force` 없이는 다시 만들지 않는다 — docreader의 등록 테이블 대신 frontmatter로 추적(MVP에서 D1 테이블은 두지 않는다)
- slug·locale은 파일명 `{slug}.{ko|en}.pdf`에서, 아니면 `--slug`·`--locale`

## 5. 넣기 변경 (`rag:build`)

지금 동작(부모 `##` 단위 최대 1,500자, 자식 300~500자·겹침 1문장, `문서 > 섹션` 접두어, 내용 해시 id)은 그대로 두고 아래만 더한다.

| 변경 | 내용 |
| --- | --- |
| 쪽 번호 | `<!-- page:N -->`를 주석 제거 전에 읽어 섹션이 시작하는 쪽을 `rag_sections.page`에 저장(마이그레이션 0005, null 허용) |
| 이미지 | 자식 텍스트에는 지금처럼 대체 텍스트만(URL은 검색 잡음). 섹션의 이미지 URL 목록은 `rag_sections.images`(JSON)에 |
| 보호 패턴 | 표(`|`로 시작하는 연속 줄)와 이미지 줄은 자식 경계에서 쪼개지 않는다. 500자를 넘는 표는 행 단위로 나누고 머리 행을 각 조각에 반복(docreader 스플리터 방식) |
| 검토 표시 | `rag-import:` 주석이 남은 문서는 지금은 경고만 한다 → `--remote`에서는 **넣지 않고 멈춘다**(운영에 검토 전 문서가 들어가지 않게) |

출처 칩은 지금처럼 slug 단위로 두고, PDF에서 온 문서는 섹션의 쪽 번호를 함께 보여 줄 수 있다(UI는 구현 때).

## 6. 이미지 서빙 (`src/pages/media/[file].ts`)

- `GET /media/{sha256}.{jpg|png|webp}`만 받는다. 이름이 형식에 안 맞으면 404 — `sources/`나 다른 키에 닿을 수 없다
- R2 `media/` 아래에서 읽어 `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`
- 같은 출처라 CSP(`img-src 'self'`)를 바꾸지 않는다
- 챗 답변 안에 이미지를 그리지는 않는다(MVP). 이미지 URL은 섹션 메타로만 쌓아 두고, 출처 카드에 보여 줄지는 나중에 정한다

## 7. 보안·개인정보

- 원본은 R2 비공개, 레포에도 안 올린다(지금 원칙 유지)
- 이미지는 공개 URL이 된다. **검토 단계에서 개인정보가 담긴 이미지(신분증, 사진, 연락처 캡처)는 줄째 지운다.** 지운 이미지는 R2에 남아도 링크되지 않는다 — 고아 이미지 정리(`rag:media:gc`)는 2차
- 지시문 의심 문장 표시(간접 프롬프트 주입)는 유지
- 입력 제한: 파일 20MB, 100쪽. 넘으면 멈춘다

## 8. 확장 (2차)

| 형식 | 파서 | 이미지 |
| --- | --- | --- |
| docx | `mammoth` → HTML → 마크다운 | 문서 안 이미지 → R2 |
| html | 본문 추출(readability 계열) → 마크다운 | `<img>` 내려받기 → R2 |
| 이미지 파일·스캔 쪽 | Workers AI 비전 모델로 글자 추출 | 원본 그대로 R2 |
| 이미지 설명 | 비전 모델로 대체 텍스트 생성 → 검토 | — |

파서를 레지스트리에 추가하는 것만으로 붙는다. 나머지(저장·초안·넣기)는 공통.

## 9. 구현 순서와 완료 기준

1. 파서 계약·레지스트리·PDF 텍스트(지금 `rag-import` 이전) — 기존 결과와 같은 마크다운이 나온다
2. PDF 이미지 추출 + R2 업로드 + URL 교체 + `/media` 경로
3. `rag:build` 변경(쪽 번호, 이미지 메타, 보호 패턴, `--remote` 검토 차단) + 마이그레이션 0005
4. 스캔 쪽 처리(그리기 또는 건너뛰기)

**완료 기준**
- 텍스트·이미지가 섞인 PDF 1개 → 초안 마크다운에 `/media/…` 이미지가 들어가고, `pnpm preview`와 운영에서 그 이미지가 열린다
- 같은 PDF를 다시 가져오면 R2 업로드가 0건이다(해시 중복)
- `rag:build --dry` 결과에 섹션마다 쪽 번호와 이미지 수가 나온다
- 검토 표시가 남은 문서로 `rag:build:remote`를 돌리면 멈춘다
- `/media/` 아래 형식이 다른 이름(`../sources/…`, 확장자 없음)은 404

## 결정 필요

- [x] R2 추가 승인 (11/02) — CLAUDE.md·overview·common 반영
- [x] 버킷 `portfolio-rag`, 로컬·운영 공용(`remote: true`) (11/02)
- [ ] 스캔 쪽 처리: 쪽 그리기·OCR 라이브러리 비교 후 결정(11/02 비교 중)
- [x] 이미지 대체 텍스트: 자리표시(`그림 p3-1`)로 두고 검토 때 사람이 고친다(11/02 구현)

## 바꿀 문서 (11/02 반영)

- `CLAUDE.md` 확정 스택: 인프라에 R2(RAG 원본·이미지)
- `docs/overview.md` 결정 표, `docs/common.md` 바인딩 목록(`R2`)
- `docs/05-06-chat-rag.md`: "PDF 가져오기"를 이 문서로 대체, 넣기 파이프라인에 쪽 번호·이미지 메타
- `docs/guides/chat-rag-setup.md`: 버킷 만들기(`wrangler r2 bucket create portfolio-rag`), 가져오기 절차

## 구현 메모 (11/02)

- 코드: CLI `scripts/ingest/index.mjs`(`pnpm rag:import`), 레지스트리 `registry.mjs`, 파서 `parsers/pdf.mjs`·`parsers/markdown.mjs`, 이미지 인코딩 `image.mjs`(`@napi-rs/canvas`, 긴 변 2,000px, 불투명은 JPEG 85 / 투명은 PNG), 저장 `store.mjs`, 서빙 `src/pages/media/[file].ts`, 넣기 `scripts/rag-build.mjs`, 마이그레이션 `0005_rag_section_page_images`
- 스크립트는 기존과 맞춰 `.mjs`로 썼다. 파서 계약은 `registry.mjs` 머리 주석에 있다
- 이미지 위치: pdf.js 연산 목록을 따라가며 변환 행렬을 계산해 그려지는 면적(쪽 대비)과 위쪽 끝을 구한다. 그 면적으로 쪽 분류와 1% 필터를 한다
- 머리말·꼬리말: 11/01 버전은 쪽 어디서든 반복되는 줄을 지워 본문의 비슷한 문장까지 지웠다 → 쪽 위·아래 10% 안의 줄만 후보로 바꿨다
- pdf.js는 받은 버퍼를 워커로 넘겨 비운다 — 파서에는 복사본을 주고 원본 저장은 원래 버퍼로 한다
- 마크다운 입력: 상대 경로 로컬 이미지만 R2로 올린다. 외부 URL 이미지는 내려받지 않고 경고
- `--no-upload`: R2에 올리지 않고 `.wrangler/tmp/ingest/{sources,media}/`에만 쓴다(로그인 없는 환경·미리보기). 올린 키는 `.wrangler/ingest-uploaded.json`에 캐시해 다시 올리지 않는다
- 넣기: 쪽 표시는 주석 제거 전에 읽어 섹션 시작 쪽을 `page`에, 이미지는 청킹 동안 자리표로 두었다가 텍스트엔 대체 텍스트, URL은 `images`에. `--remote`에서 검토 전 문서가 있으면 멈춘다
- 스캔 쪽은 아직 `<!-- 스캔 쪽 pN … -->` 표시만 남긴다(4단계 결정 대기)
- 확인(11/02, Chromium으로 만든 4쪽 한국어 PDF — 본문·그림·작은 아이콘·쪽마다 로고·반복 머리말·전면 이미지 쪽·지시문): 그림 1개만 남고 아이콘·로고 제외, 머리말 제거, 3쪽 스캔 판정, 지시문 경고, 다시 가져오면 건너뜀, `rag:build --dry`에 쪽·이미지 수 표시, 30행 표가 머리 행을 반복하며 3조각(행 누락 없음), `rag:build --remote`는 검토 전 문서로 멈춤
- `/media`: 로컬 R2 에뮬레이션(`wrangler dev`, 원격 바인딩 끔)에서 해시 이름 200 + `immutable`·`nosniff`·ETag, 확장자 다름·대문자·`../sources/`·형식 아님은 404
- 아직 못 한 확인: 원격 R2 실제 업로드와 운영 `/media`(이 세션은 Cloudflare 로그인이 없다) — 버킷을 만든 뒤 로컬에서
