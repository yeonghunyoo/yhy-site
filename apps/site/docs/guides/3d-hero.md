# 히어로 3D — 촬영부터 사이트까지 (11/05, 제안 — decisions S-008)

"Better call yh!" 오마주 히어로: 본인 얼굴 스캔을 3D로 띄우고, 저해상도 격자 + 흑백 계조 + 디더링으로 픽셀화하고, 스크롤에 따라 카메라가 다가가 마지막에 확 줌인한다. 원작 영상·로고·글꼴·배우 얼굴은 쓰지 않는다 — 재현하는 건 광고 클리셰(정장, 가리키는 손, 천칭)와 카메라 연출이다.

**11/05 사이트 홈에 반영·배포(decisions S-009, 모델은 임시 흉상).** 프로토타입: claude.ai 아티팩트 "Better Call YH 3D". 장면 코드는 `src/lib/hero/scene.js` 하나를 사이트·프레임 렌더·프로토타입이 같이 쓴다.

## 흐름

```
① 촬영·스캔(본인) → ② 정리(Blender) → ③ 최적화 pnpm hero:optimize
  → ④ 장면 확인 pnpm hero:preview → ⑤ 프레임 렌더 pnpm hero:frames → 사이트(1차 스프라이트, 2차 실시간)
```

| 파일 | 역할 |
| --- | --- |
| `src/lib/hero/scene.js` (+ `scene.d.ts`) | 장면(흉상·조명·카메라 경로) + 픽셀화 후처리 셰이더. `createHero(canvas, opts)` → `setProgress(0~1)`, `snapshot()`, `loadModel(url)` |
| `scripts/hero/scene.html` | 로컬 셸. 쿼리 `model` `cols` `levels` `aspect` `preserve` |
| `scripts/hero/serve.mjs` | `apps/site`를 루트로 정적 서버(`pnpm hero:preview`, 4321) |
| `scripts/hero/optimize.mjs` | `hero-src/head.glb` → `hero-src/out/head.min.glb` (Meshopt + WebP 1024px + 면 50%) |
| `scripts/hero/frames.mjs` | 헤드리스로 진행도 0~1을 N장 → `hero-src/out/hero-sprite.webp`(세로로 쌓은 무손실) + `.json`. `--publish`면 `public/hero/`. `--poster=1`이면 홈 정적 이미지 `public/hero/poster.webp`만 |
| `src/lib/hero/hero.ts` | 사이트 홈: 스크롤 → 진행도·문구·패럴랙스, WebGL이면 `scene.js` 동적 import |
| `hero-src/` | 원본 작업 폴더 — `.gitignore`(README만 커밋). 얼굴 스캔은 공개 레포에 올리지 않는다 |

## ① 촬영·스캔 — 본인

- 앱: Scaniverse(무료·기기 처리), Polycam(사진 모드), KIRI Engine, RealityScan
- 두 사람: 본인은 앉아서 가만히, 다른 사람이 머리 주위를 2~3바퀴(눈높이·위·아래). 사진 모드면 40~80장
- 조명은 그림자 없이 고르게(흐린 날 창가). 강한 빛은 3D에서 넣는다
- 표정은 굳어진다 — 밈 표정(눈썹 올리고 한쪽 입꼬리)으로. 정장·셔츠 + 넥타이, 어깨까지
- 피할 것: 안경, 번들거리는 피부, 흐트러진 머리카락
- 손가락 포즈는 손만 따로 스캔하거나 무료 손 모델
- 내보내기: GLB(추천). `hero-src/head.glb`에 둔다

## ② 정리 — Blender(무료)

1. 불러와서 떠 있는 조각·바닥 지우기, 흉상만 남기기
2. 구멍 메우기(정수리·목 아래)
3. 면 줄이기(Decimate) 2만~5만 — 저해상도라 1만 안팎도 충분
4. 정면 +Z, 실제 크기(m). 위치·크기는 `scene.js`의 `fitModel`이 흉상 높이 3, 정수리 y=2.15로 맞춘다
5. **넥타이 메시 이름에 `tie`** → 강조색 한 군데(셰이더가 마젠타 표식 재질을 강조색으로 바꾼다)
6. GLB로 `hero-src/head.glb`에 덮어쓰기. 어려우면 ① 원본만 두면 된다

## ③~⑤ 명령

```bash
pnpm site hero:optimize
pnpm site hero:preview
pnpm site hero:frames --model=/hero-src/out/head.min.glb --frames=48
```
- 미리보기: `http://localhost:4321/scripts/hero/scene.html?model=/hero-src/out/head.min.glb` — 아래 슬라이더가 진행도
- 프레임 렌더는 Playwright Chromium이 필요하다: 처음 한 번 `pnpm --filter portfolio-web exec playwright install chromium`. 다른 Chromium을 쓰면 `HERO_CHROMIUM=/path`
- 확인되면 `--publish`로 `public/hero/`에 복사해 커밋한다(스프라이트·json만)

## 연출 값 (프로토타입에서 맞춘다)

| 값 | 기본 | 뜻 |
| --- | --- | --- |
| `cell` | 16px | **기본 단위 = 칸 크기**(11/05, 24 → 16). 가로 칸 수 = 화면 폭 ÷ `cell` — 1280px면 80칸(처음 104칸의 약 75%) |
| `minCols`·`maxCols` | 40 · 84 | 칸 수 한계. 폰(390px)은 40칸(칸 ~10px), 아주 넓은 화면도 84칸까지 |
| `cols` | 없음 | 주면 칸 수 고정(프레임 렌더 기본 80) |
| 시작 격자 | 고운 격자의 30% | **진행도 0~0.08(`RESOLVE`)** 동안 거친 칸 → 최대 해상도로 부드럽게 맺힌 뒤 끝까지 유지(11/05 — 처음부터 천천히 올리면 카메라 앵글이 안 보여서) |
| `levels` | 6 | 흑백 계조 단계(11/05: 12 → 6) |
| `dither` | 켬(기본) | 4×4 Bayer |
| 블러 | 진행도 0~0.08 | 칸 단위 상자 블러, 시작 세기 55% → 0 |
| 카메라 | `FACE`·`SHOTS`·`cameraAt` | **11/05 동선** — 인물은 화면 왼쪽 대각(`FACE` −35°)을 보고 서 있다. 1스텝(진행도 0~0.55): 정면 멀리에서 다가가며 인물의 오른쪽 대각(3/4) → 반대로 돌아 왼쪽 대각 쪽에서 **인물의 오른쪽 눈** 클로즈업. 2스텝(0.55~1): **인물의 왼쪽 눈** 클로즈업으로 컷 → 줌아웃해 상반신 + "BETTER CALL YH!". |
| 카메라 회전 | `roll`·`pitch` | 키프레임마다 z축(화면 기울기)·x축(끄덕임) 각 + 구간 안 잔물결(roll ±4°, pitch ±1.5°). 구간 끝에서 0 — 컷과 마지막 수평 화면은 그대로 |
| 대상점 | `POINTS` | head·bust·eyeR(인물의 오른쪽 눈, 모델 −X)·eyeL(왼쪽 눈, +X). 모델 좌표로 적고 장면에서 `FACE`만큼 돌린다. 스캔 모델은 `opts.points`로 눈 위치를 맞춘다 |
| 색 | `palette` | `dark` #17191c · `light` #e9ebe6 · `accent`(tokens.css와 맞춘다) |

곡선은 `scene.js`의 `look(p)` 하나 — 프레임 렌더와 실시간이 같은 값을 쓴다.

**ASCII 모드 (11/05, `mode: 'ascii'`)** — [Codrops 모양 인식 ASCII 렌더러](https://tympanus.net/codrops/2026/09/04/beyond-the-luminance-ramp-a-shape-aware-ascii-renderer-in-three-js/)를 가볍게 옮김
- 후처리 패스가 칸마다 색 대신 글자 정보를 담는다: r = 밝기 단계(ramp ` .:-=+*#%@`), g = 윤곽 방향(이웃 칸 밝기 기울기가 `edge` 0.16보다 크면 윤곽선 방향을 4방향 `- / | \`로), b = 강조(넥타이)
- 화면 패스가 칸 안 위치로 글자 아틀라스(캔버스에 IBM Plex Mono로 그림, 글꼴이 늦게 오면 다시 그림)를 찍는다. 윤곽 글자는 밝게, 밝기 글자는 밝기만큼, 강조는 강조색
- 프레임 렌더(`snapshot`)는 pixel 모드 전용
- 사이트는 아직 `pixel`(기본값). 프로토타입은 `ascii`로 보며 `#tune`에서 바꿔 본다

**해독 타이포그래피 모듈 (11/05, 적용 안 함)** — `src/lib/scramble.ts`. 문단이 화면에 들어오면 ASCII 기호로 덮였다가 앞에서부터 풀린다(원래 글자는 투명하게 자리를 지켜 줄바꿈 그대로). 프로토타입에서 보고 "정신없다"는 의견으로 적용은 뺐다. 쓰는 법은 파일 머리 주석

**11/05 결정**: 히어로는 `pixel` 유지(ASCII 모드는 코드에 남김)

**픽셀 효과가 만들어지는 방식 (WebGL 셰이더, three.js)**
1. 3D 장면을 화면 크기가 아니라 격자 크기(예: 1280×720 화면이면 80×45)의 작은 타깃에 그린다
2. 후처리 셰이더가 칸마다(격자 = 화면 폭 ÷ `cell`): 진행도에 따른 격자로 칸을 맞추고(거칠게 시작) → 블러(칸 단위 상자, 반경 최대 3칸) → 밝기 → `levels`단계로 양자화 + 4×4 Bayer 디더 → `dark`~`light` 두 색 사이로. 마젠타 표식 재질(넥타이)만 `accent`
3. 결과(격자 크기)를 화면에 칸 그대로 키워 옮긴다(Nearest + CSS `image-rendering: pixelated`)
- 성능(11/05): 2단계를 화면 픽셀마다가 아니라 격자 크기에서 한 번만 돈다 — 소프트웨어 GPU 측정 85 → 33ms. 진행도가 같으면 다시 그리지 않는다(커튼 구간에선 그리기 0). 고정 장면에 `will-change: transform`

## 사이트 연결 (11/05 반영 — 실시간 3D가 기본, 스프라이트는 쓰지 않음)

**스크롤 구조 (11/05 프로토타입에서 확인, 사용자 OK)**
- 히어로 구간 252vh(11/05: 180 → 252, 40% 늘림): 화면 고정(sticky) 캔버스, 진행도 p 0→1(거친 픽셀·블러 → 고운 픽셀·선명, 마지막 줌인 + "BETTER CALL YH!"). 처음 520vh는 길다는 의견으로 줄였다
- 머묾 구간 100vh(11/05): 마지막 문장("BETTER CALL YH!")이 다 보인 뒤 바로 넘기지 않고 머문다. 앞 70% 동안 `setOutro(0→1)` — 장면이 가운데로 줄어들며(85%까지) 칸이 무작위로 하나씩 꺼져 문장만 남는다
- 커튼 구간 100vh: 본문이 위로 올라와 장면을 덮는다(`margin-top: -100vh`, 위쪽 그림자). **패럴랙스** — 본문은 스크롤과 같은 속도(정비례)로 올라오고, 뒤의 장면은 그 35% 속도로만 올라가며 어두워진다(0 → 75%). 속도 차이가 깊이감을 만든다(11/05 정정: 본문 속도를 비틀던 easing은 뺐다)
- 조절 막대(칸·계조·디더·강조색)는 확인용 — 프로토타입 주소 끝 `#tune`일 때만. 사이트에는 넣지 않는다
- 그 뒤는 평범한 본문 스크롤(소개 · 사건 기록(프로젝트) · 경력 · 상담)

- (구상만, 지금 안 씀) **스프라이트**: `public/hero/hero-sprite.webp`를 `image-rendering: pixelated`로 키우고 스크롤 진행도로 프레임(y 오프셋)을 고른다. three.js를 보내지 않는다. `prefers-reduced-motion`이면 마지막 프레임 한 장
- **실시간(WebGL 되는 모든 기기, 11/05 반영)**: `hero.ts`가 `scene.js` + three.js를 동적 import(gzip 약 144KB, 초기 JS 밖). 그 전·안 될 때는 포스터. 모델은 `head.min.glb`를 `public/hero/`에(누구나 받을 수 있다 — 면 줄인 것만)
- 파일은 `/media/`가 아니라 `public/`(비용, docs/01-frontend.md "SEO·GEO"). CSP: 같은 출처 스크립트 + WebGL이라 그대로
- 글(문구)은 항상 HTML에 — 캔버스는 꾸밈(`aria-hidden` 또는 `role="img"` + 설명)

## 남은 결정

- 모델 교체 시: `scene.js`의 `createHero`에 `modelUrl`(예: `/hero/head.min.glb`)을 넘기고, `astro.config.mjs` CSP `script-src`에 `'wasm-unsafe-eval'`(Meshopt 디코더), 포스터 다시 생성(`pnpm site hero:frames --model=… --poster=1`)

- 스토리 장 구성(1~5장)과 각 장의 카메라 지점
- 천칭: 실물 사진(CC0)·직접 촬영·3D 모델 중
- 2차 실시간 3D를 할지(용량 수백 KB~1MB)
