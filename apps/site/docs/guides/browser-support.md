# 브라우저·OS 대응 (전수 점검 11/03)

설계는 [01-frontend.md](../01-frontend.md). 이 문서는 데스크톱 Safari·Chrome, Android Chrome, iOS Safari(그리고 같은 WebKit을 쓰는 iOS 앱 안 브라우저)에서 현재 기능을 점검한 결과와 고친 것, 실기기로만 확인할 수 있는 목록이다.

## 지원 범위

| 대상 | 최소 버전 | 근거 |
| --- | --- | --- |
| iOS·macOS Safari | **16.4** | Tailwind v4가 `@property`·`color-mix()`·캐스케이드 레이어를 쓴다(16.4+). `100dvh`(15.4+), `:has()`(15.4+), `TextDecoderStream`(14.1+)은 그 안에 들어간다 |
| Chrome(데스크톱·Android) | **111** | Tailwind v4 기준 |
| iOS 앱 안 브라우저(카카오톡·인스타그램 등) | iOS의 WebKit을 따른다 | Google 로그인만 막힌다(아래) |

16.4~16.7(iPhone 8·X는 iOS 16이 마지막)에는 Popover API(17+)와 `URLSearchParams.size`(17+)가 없다 — 둘 다 대체했다.

## 점검 방법

- **Chromium(실제 실행)**: `pnpm preview`(wrangler dev) + Playwright. 데스크톱 1280×800, iPhone 크기 390×844(터치·DPR 3·iOS UA), 작은 Android 360×640(Pixel UA). 원격 바인딩(AI·Vectorize·R2)과 세션이 필요한 엔드포인트는 가짜 응답으로 바꿨다.
- **WebKit(코드·빌드 결과 검토)**: 이 환경에는 WebKit을 설치할 수 없다. 생성된 HTML·CSS와 클라이언트 코드를 Safari/iOS의 알려진 차이(아래 표)와 대조했다. Safari 16 동작은 Chromium에서 해당 API를 지워 흉내 냈다.

## 결과

| 기능 | 데스크톱 Chrome | Android Chrome | iOS Safari | 데스크톱 Safari | 비고 |
| --- | --- | --- | --- | --- | --- |
| 페이지(홈·프로젝트·개인정보·404) 가로 넘침 없음 | OK | OK | 실기기 | 실기기 | 3개 크기 모두 0px |
| 한/영 전환 | OK | OK | OK(코드) | OK(코드) | 일반 링크 |
| 모바일 메뉴 | — | OK | **고침**(16.x) | — | Safari 16은 `popover` 속성을 몰라 메뉴가 늘 보였다 → 대체 구현 |
| 로그인 시트(매직링크·Google) | OK | OK | **고침** | OK | 앱 안 브라우저 Google 차단 안내, 뒤로 가기 스피너 |
| 레터·계정 시트 | OK | OK | **고침** | OK | 배경 스크롤 잠금을 iOS 방식으로 |
| 시트·챗 배경 스크롤 잠금 | OK | OK | **고침** | OK | 시트가 `overflow:hidden`만 걸어 iOS에서 밀렸다 |
| 챗(열기·전송·대기 표시·답·출처·레터 칩) | OK | OK | OK(코드) | OK(코드) | SSE는 `fetch` + `TextDecoderStream`(14.1+) |
| 챗 키보드(입력창이 키보드 바로 위) | — | **고침** | 실기기 | — | Android 판정 수정, iOS는 `visualViewport` |
| 챗 위에 시트(레터 칩 → 로그인) | OK | OK | OK | OK | Esc는 맨 위 시트만 닫게 고침, 잠금 횟수 계산 |
| 배포 직후 열려 있던 탭 | **고침** | **고침** | **고침** | **고침** | 사라진 JS 파일 404 → 한 번 새로고침하고 누르던 동작 이어감 |
| 로그인 복귀 쿼리 정리 | OK | OK | **고침**(16.x) | OK | `URLSearchParams.size` |
| 입력 글자 16px(iOS 확대 방지) | OK | OK | OK | — | `.field`, 챗 입력 16px |
| 터치 영역 ≥44px | — | OK | OK | — | 숨김 상태의 "본문으로 건너뛰기" 링크만 1×1(포커스될 때만 보인다) |
| 로딩 표시(버튼 스피너, 하이드레이트 전 첫 클릭) | OK | OK | OK(코드) | OK(코드) | `-webkit-text-fill-color`로 글자 숨김 |
| 움직임 줄이기 | OK | OK | OK(코드) | OK(코드) | 스피너만 느리게 |
| 관리자 화면(레이아웃·처리 중 표시) | 코드 | 코드 | 코드 | 코드 | 관리자 세션이 없어 실행 못 함. 헤더는 가로 스크롤, 버튼 44px, `e.submitter`(15.4+) |
| `/media` 이미지 | 운영 확인 | 운영 확인 | 운영 확인 | 운영 확인 | 이 환경의 로컬 미리보기는 원격 R2 연결이 안 돼 500 |
| 초기 JS | 7.2KB(인라인, 압축 전) | 같음 | 같음 | 같음 | 예산 50KB |
| `:hover` 끈적임 | OK | OK | OK | — | Tailwind v4가 `hover:`를 `@media (hover:hover)`로 감싼다 |
| `backdrop-blur` | OK | OK | OK | OK | 빌드에 `-webkit-backdrop-filter` 포함 |
| 사설 모드 `sessionStorage` | OK | OK | OK | OK | 모든 접근이 try/catch |

## 고친 것 (11/03)

| 문제 | 영향 | 고친 곳 |
| --- | --- | --- |
| Safari 16.x는 Popover API가 없어 모바일 메뉴 패널이 페이지 위에 늘 떠 있고 버튼이 동작하지 않았다 | iOS 16 | `src/styles/global.css`(`@supports not selector(:popover-open)`이면 `[popover]` 숨김), `src/components/ui/Header.astro`(`.popover-open` 클래스로 열고 바깥 탭·Esc·링크로 닫기, `aria-expanded`) |
| 시트(로그인·레터·계정)가 배경 잠금을 `html{overflow:hidden}`으로만 해 iOS에서 배경이 밀려 스크롤됐다. 챗과 시트가 겹치면 먼저 닫힌 쪽이 잠금을 풀어 버릴 수 있었다 | iOS | 공용 `src/components/islands/scroll-lock.ts`(body `position:fixed` + 위치 복원, 잠근 횟수 계산) — `Sheet.tsx`, `ChatDock.tsx`가 함께 쓴다 |
| Esc 한 번에 위의 시트와 아래 챗이 같이 닫혔다 | 전체 | `ChatDock.tsx` — `aria-modal` 시트가 있으면 챗은 Esc를 무시 |
| 배포 뒤 예전 HTML이 사라진 `/_astro/*.js`를 불러 로그인·레터·챗 버튼이 먹지 않았다(오래 열어 둔 탭, Safari의 bfcache·탭 복원에서 흔하다) | 전체, 특히 iOS | `src/directives/demand.ts` — `astro:hydration-error`가 모듈 로드 실패면 1분에 한 번만 새로고침하고, 누르던 동작(로그인·레터·챗)을 이어서 연다 |
| `URLSearchParams.size`(Safari 17+) 때문에 iOS 16에서 로그인 복귀 쿼리를 지울 때 다른 쿼리까지 지워졌다 | iOS 16 | `Overlay.tsx` — `params.toString()`으로 판단 |
| 앱 안 브라우저(카카오톡·인스타그램·페이스북·라인·네이버, Android WebView)에서 Google이 로그인을 막는다(`403 disallowed_useragent`) | 앱 안 브라우저 | `LoginSheet.tsx` — Google 버튼을 끄고 "이메일 링크 또는 Safari·Chrome에서 열기" 안내(`auth.googleInApp`) |
| Google로 갔다가 뒤로 가기로 돌아오면 스피너가 남았다 | Safari bfcache | `LoginSheet.tsx` — `pageshow`(persisted)에서 대기 상태 초기화 |
| Chrome Android(`interactive-widget=resizes-content`)는 키보드가 떠도 `innerHeight`가 같이 줄어 키보드를 못 알아채 아래 safe-area 여백이 남았다 | Android | `ChatDock.tsx` — 열린 뒤 본 가장 큰 높이와 비교 |
| 모바일 챗 패널은 높이를 계산하기 전(첫 프레임, `visualViewport`가 없을 때) 아래 끝이 없어 내용 높이로 줄었다 | 모바일 | `ChatDock.tsx` — 기본 `bottom-0`, 계산한 높이가 있으면 그쪽이 우선 |

## 알아 둘 동작(고칠 대상 아님)

- **매직링크를 다른 브라우저에서 연 경우**: 메일 앱이 링크를 자기 앱 안 브라우저로 열면 로그인은 그 브라우저에서 된다. 요청한 브라우저(예: Safari)에는 세션이 생기지 않는다 — 쿠키는 브라우저마다 따로라서. 링크를 연 쪽에서 "로그인됐어요" 안내가 나오고, 원래 브라우저에서는 다시 로그인해야 한다. → 11/03 해결: 같은 메일에 6자리 인증 코드를 함께 보내고, 요청한 브라우저의 로그인 시트에서 코드로 로그인한다([02-auth.md](../02-auth.md) "매직링크 + 인증 코드 흐름")
- **ITP·서드파티 쿠키**: 인증 쿠키는 같은 사이트(1st-party)이고 Google 로그인은 최상위 이동(SameSite=Lax로 충분)이라 Safari ITP의 영향을 받지 않는다
- **iOS 앱 안 브라우저의 외부 열기**: 카카오톡은 `kakaotalk://web/openExternal?url=`로 외부 브라우저를 열 수 있지만 앱마다 달라 지금은 안내만 한다

## 실기기 확인 목록

이 환경에서는 확인할 수 없어 실기기로 봐야 한다. 배포 뒤 **iPhone Safari, Android Chrome, 카카오톡 안 브라우저(iPhone·Android)**에서:

1. 챗 열기 → 입력창 탭 → 키보드가 올라오면 입력창이 키보드 바로 위에 붙고, 아래로 페이지 내용이 보이지 않는다. 메시지 목록만 스크롤된다
2. 챗이나 로그인 시트가 열린 채 배경을 위아래로 쓸어도 뒤 페이지가 움직이지 않는다. 닫으면 원래 스크롤 위치로 돌아온다
3. 로그인 시트에서 이메일 입력칸을 눌러도 화면이 확대되지 않는다. 키보드가 떠도 전송 버튼이 보인다
4. 홈 화면 아래 홈 바(노치) 영역에 챗 버튼·토스트가 가려지지 않는다. 가로 모드에서 좌우 노치에 글자가 가려지지 않는다
5. 모바일 메뉴(≡)가 열리고 바깥 탭으로 닫힌다. iOS 16 기기가 있으면 거기서도
6. Google 로그인 → 돌아와서 로그인된다. 카카오톡 안에서는 Google 버튼이 꺼지고 안내가 보인다
7. 매직링크·인증 코드: 메일 앱에서 링크를 눌렀을 때 어느 브라우저에서 열리는지 보고, 링크가 다른 앱 안에서 열리면 원래 브라우저의 로그인 시트에 메일의 6자리 코드를 넣어 로그인되는지(iOS는 키보드 위 "메일에서" 코드 자동 제안이 뜨는지도)
8. 배포 직후 미리 열어 둔 탭에서 챗·로그인 버튼을 누르면(한 번 새로고침된 뒤) 열린다
9. 다크 모드 전환 시 색이 바뀐다(`color-scheme`)

## 11/03 추가 수정 — 키보드가 떴을 때 입력란 아래로 뒤 화면이 보이던 문제

실기기(iPhone)에서 챗·시트의 입력란 아래로 뒤 페이지가 보이고 눌렸다. iOS는 body를 고정해도 키보드가 떠 있으면 보이는 영역(visualViewport)을 손가락으로 밀 수 있어, 창이 끝나는 키보드 윗선 아래의 페이지가 드러난다.
- 챗(모바일): 창 뒤에 같은 배경색 막을 화면 높이의 2배(`h-[200lvh]`)로 깔아 페이지를 덮는다 — 보이지도 눌리지도 않는다
- 시트: 어두운 막을 2배 높이로 늘리고, 시트 아래(키보드 뒤)로 같은 배경색을 `::after`로 이어 붙인다
- 터치 스크롤: 잠긴 동안 `touchmove`를 막고, `data-scroll-allow`(메시지 목록·시트 본문·textarea) 안에서 실제로 스크롤할 수 있는 방향만 허용한다(`scroll-lock.ts`). 핀치 확대는 그대로
- 확인(Chromium, iPhone 13 크기, 키보드 흉내): 창 아래 지점이 막으로 덮임, 머리·막 끌기 막힘, 목록 맨 위에서 아래로 끌기 막힘(페이지 당김 없음), 스크롤 중인 목록은 허용, 닫으면 body 고정 해제. 실기기 재확인 필요

## 11/03 추가 수정 — 키보드를 내릴 때마다 창이 아래에서 위로 출렁이던 문제

iOS는 키보드가 오르내리는 동안 보이는 영역의 높이·위치를 애니메이션으로 바꾸지만 이벤트는 매 프레임 주지 않는다. 챗·시트가 그 값을 React 상태로 받아 다시 그려 한두 프레임씩 늦었고, 그 지연이 출렁임으로 보였다.
- `src/components/islands/viewport.ts`: 이벤트(`resize`·`scroll`·`focusin/out`)가 오면 0.7초 동안 매 프레임 값을 다시 읽어, 챗은 높이와 `translate3d` 위치를, 시트는 아래 여백과 최대 높이를 DOM에 바로 쓴다. React 상태는 키보드 여부(안전 영역 여백)만
- 목록이 맨 아래였으면 높이가 바뀐 뒤에도 맨 아래를 유지한다
- 확인(Chromium, iPhone 13 크기): 이벤트는 첫 프레임에만 주고 20프레임 동안 값만 바꾼 내림 애니메이션에서 창 위치·높이 지연 0px, 닫으면 스타일 원복. 실기기 재확인 필요

## 11/03 추가 수정 — 키보드가 떴을 때 레터 시트 본문 영역이 너무 좁던 문제

키보드가 뜨면 보이는 영역의 92%만 시트로 쓰고, 그 안에서 손잡이·제목·전송 버튼·안내 문구·safe-area 여백이 고정으로 자리를 차지해 실제 입력 영역이 몇 줄밖에 남지 않았다.
- `Sheet.tsx`: 키보드가 떠 있으면(`viewport.ts`의 `keyboard`) 최대 높이를 보이는 영역 100%로 쓰고, 패널에 `data-keyboard`를 붙인다. 이때 드래그 손잡이를 숨기고 하단 고정 영역의 위아래 여백을 줄이며 safe-area 여백을 뺀다(키보드가 홈 인디케이터를 덮는다)
- 시트를 쓰는 쪽은 키보드가 떠 있을 때 숨길 부가 요소에 `group-data-keyboard/sheet:hidden`을 단다 — 레터 시트의 개인정보 안내 문구
- 실기기 재확인 필요

## 11/03 추가 수정 — 챗 흐름도 위에서 세로로 끌면 챗 목록이 스크롤되지 않던 문제

흐름도 미리보기가 가로 스크롤 상자(`data-scroll-allow`)여서, 스크롤 잠금이 가장 가까운 허용 영역인 흐름도 상자만 보고 세로로는 스크롤할 수 없다며 터치를 막았다.
- `DiagramView.tsx`: 미리보기는 스크롤 없이 전체가 보이게 줄이고(칸 폭·최대 높이 320px), 누르면 크게 보기가 열린다. 크게 보기는 body로 꺼내(챗 패널의 transform에 갇히지 않게) 핀치·끌기·두 번 탭·휠로 확대·이동한다(`touch-none`, 포인터 이벤트)
- `scroll-lock.ts`: 허용 영역이 겹치면 바깥 허용 영역까지 올라가며 끄는 방향으로 스크롤할 수 있는 곳을 찾는다. 가로로 끌기도 본다
- 확인(Chromium, iPhone 13 크기, CDP 터치): 흐름도 위에서 위로 끌기 — 전 목록 스크롤 0px, 후 173px(크게 보기는 안 열림). 미리보기 탭 → 크게 보기 열림, 핀치로 확대, 끌기 이동, 두 번 탭·맞추기 버튼으로 원복. 실기기 재확인 필요
