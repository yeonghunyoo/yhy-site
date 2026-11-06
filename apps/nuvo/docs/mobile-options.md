# 모바일 앱 방식 — Capacitor vs Expo, 기기 간 같은 사진 판정

2026-11-06 조사. 상태: **비교 자료, 결정 전** — 결정은 실기기 시제품 뒤([decisions.md](decisions.md) D-023 제안).
목표·순서는 [service-plan.md](service-plan.md) "모바일", 플랫폼 규칙은 [platform-policy.md](platform-policy.md), 스토어 정책은 [media-security.md](media-security.md) 3·4절.

**출처 한계:** 조사 환경에서 docs.expo.dev·capacitorjs.com·capgo.app·revenuecat.com·swmansion.com 등을 직접 열지 못해, npm 패키지 원본(CHANGELOG·README·소스)·GitHub·developer.apple.com·developer.android.com으로 확인했습니다. ⚠는 확인하지 못했거나 유지보수가 불안한 항목입니다. 사실과 의견(💬)을 나눴습니다.

## 앱이 해야 할 일 (판단 기준)

1. 휴대폰 사진첩 전체(수만 장)를 OS 썸네일로 빠르게 스크롤 — iOS "선택한 사진만", Android 부분 접근 포함
2. 원본(HEIC·JPEG, 나중에 짧은 동영상)을 백그라운드로 업로드 — iOS URLSession 백그라운드·BGContinuedProcessingTask, Android WorkManager·사용자 시작 전송 작업
3. 구독: iOS IAP(StoreKit 2)·Google Play 결제
4. 로그인: Sign in with Apple·Google·카카오, 서버는 Better Auth
5. 초대받은 Space 보기(서버 API, 지금 웹과 같은 것)

## 현재 버전 (11/06)

| | 최신 | 비고 |
|---|---|---|
| Capacitor | 8.6.0 (2026-10-28) | 8.0.0은 2025-12, 9.0.0-beta 공개 — https://www.npmjs.com/package/@capacitor/core |
| Expo | SDK 58 (2026-09-29), React Native 0.88 | https://www.npmjs.com/package/expo |

## 1. 사진첩과 썸네일

| | A. Capacitor | B. Expo |
|---|---|---|
| 라이브러리 | `@capgo/capacitor-photo-library` 8.0.32: 페이지 단위 조회, iOS limited·Android `READ_MEDIA_VISUAL_USER_SELECTED` 처리, 썸네일은 **파일 경로**(base64 아님)로 받아 `convertFileSrc`로 WebView에 표시. 썸네일을 JPEG 파일로 캐시에 쓰는 방식으로 보임 | `expo-media-library` 58(SDK 56부터 새 객체 API): `Query().limit().offset()` 페이지 조회, 권한 선택기 다시 열기, iOS `getIsInCloud()`·Live Photo 영상·iCloud 원본 내려받기(`getUri()`) |
| 썸네일 표시 | 파일 → WebView `<img>`. `@capacitor-community/media`는 base64·iOS 전용이라 대용량에 부적합 | `expo-image`가 iOS `ph://` 에셋을 직접 그림 + FlashList/LegendList 가상화 |
| 1만 장 성능 근거 | ⚠ 벤치마크 못 찾음. Capacitor iOS의 URL 스킴 핸들러를 상속해 PHImageManager 썸네일을 파일 없이 서빙하는 건 💬 추론 | Expo 블로그의 수천 장 그리드 예, 반대로 이미지가 너무 많으면 메모리 크래시 보고도 있음(⚠ 검색 요약) |
| 빈 곳 | — | ⚠ 썸네일 전용 API·파일 크기 필드 없음, Android 모션 포토 API 없음 |

출처: https://www.npmjs.com/package/@capgo/capacitor-photo-library · https://github.com/capacitor-community/media · https://github.com/expo/expo/blob/main/packages/expo-media-library/CHANGELOG.md · https://github.com/expo/expo/pull/47790

## 2. 백그라운드 업로드

| | A. Capacitor | B. Expo |
|---|---|---|
| iOS | `@capgo/capacitor-uploader`: URLSession 백그라운드(소스 확인) | `expo-file-system` `createUploadTask()`: 기본이 URLSession 백그라운드 |
| Android | 같은 플러그인이 `gotev/uploadservice` 포그라운드 서비스 + 알림(WorkManager 아님, ⚠ 유지보수 미확인) | WorkManager·포그라운드 서비스 **없음**(소스 확인) |
| 주기 작업 | `@capawesome/capacitor-background-task`는 짧은 유예 시간만 — 업로드 큐로 못 씀 | `expo-background-task`: iOS BGProcessing·Android WorkManager 위 주기 작업(업로드 전용 아님). `react-native-background-upload`는 2022 이후 릴리스 없음 ⚠ |

- **양쪽 모두** iOS 26 `BGContinuedProcessingTask`(첫 대량 백업, Live Activity 진행률)와 Android WorkManager·사용자 시작 전송 작업은 **직접 네이티브 모듈**을 써야 합니다. 기성 플러그인으로 끝나는 쪽은 없습니다
- ⚠ `BGContinuedProcessingTask`가 iOS 26 정식판에서 동작하지 않았다는 포럼 보고 — https://developer.apple.com/forums/thread/801126
- Android 정책상 자동 백업은 포그라운드 서비스(dataSync)로 정당화하기 어려움 → WorkManager 쪽으로([media-security.md](media-security.md) 4.6)

## 3. 구독 (IAP·Play 결제)

- 양쪽 다 선택지가 충분합니다: Capacitor는 `@revenuecat/purchases-capacitor` 14(Capacitor 8+), `@capgo/native-purchases`, `cordova-plugin-purchase` / RN은 `react-native-purchases` 11, `expo-iap` 6, `react-native-iap` 17 (모두 2026년 갱신)
- **RevenueCat**: 월 추적 매출 $2,500까지 무료, 넘으면 1% — https://www.revenuecat.com/pricing/ (⚠ 무료 구간 웹훅 사용 범위는 출처가 엇갈림)
- 직접 하면 서버가 Apple App Store Server Notifications V2(JWS 검증)와 Google RTDN(Pub/Sub, 받은 뒤 **반드시** Play Developer API 재조회 — https://developer.android.com/google/play/billing/rtdn-reference)를 모두 처리해야 합니다. 경로 자리는 이미 있음(`worker/routes/billing.ts`)
- 💬 RevenueCat을 쓰면 서버 쪽을 웹훅 하나로 줄일 수 있습니다. 매출이 작을 때는 무료라 1차에 맞음. 대신 구독 상태의 원본이 외부에 생기므로 `subscriptions` 표를 웹훅으로 맞추는 구조로

## 4. 로그인 (Better Auth 1.7)

| | A. Capacitor | B. Expo |
|---|---|---|
| Better Auth | **공식 통합 없음.** 외부 브라우저 OAuth 뒤 쿠키를 앱이 못 읽는 이슈 열려 있음(https://github.com/better-auth/better-auth/issues/6930). 커뮤니티 `better-auth-capacitor` 0.4(성숙도 낮음 ⚠). WKWebView 오리진(`capacitor://localhost`)·쿠키 제약 → 실무는 bearer 토큰으로 바꿈 | **공식 `@better-auth/expo`**: 쿠키를 SecureStore에 저장해 자동으로 붙임, 소셜 로그인은 브라우저 + 딥링크 — https://github.com/better-auth/better-auth/blob/main/docs/content/docs/integrations/expo.mdx |
| Apple·Google | `@capgo/capacitor-social-login` 8.7(Apple·Google 네이티브) | `expo-apple-authentication`, `@react-native-google-signin/google-signin` |
| 카카오 | `capacitor-kakao-login-plugin`은 Capacitor 7용, 2025-02 이후 릴리스 없음 ⚠ — **Capacitor 8용 없음** | `@react-native-kakao/user` 3.2 (2026-11) |

- 공통: Better Auth 카카오 제공자에는 네이티브 SDK 토큰 검증(`verifyIdToken`)이 없어 보임 → 앱의 카카오 네이티브 로그인은 서버에 작은 엔드포인트가 더 필요할 수 있음(💬 추론). 웹 브라우저 OAuth 방식이면 필요 없음

## 5. App Store 4.2 (웹사이트 재포장) 위험

- 원문: "elevate it beyond a repackaged website" — https://developer.apple.com/app-store/review/guidelines/
- 2026-01 사례: 위치·Swift 플러그인·공유 시트를 넣은 Capacitor 앱도 반복 거절 — https://developer.apple.com/forums/thread/812889
- 💬 nuvo는 첫 화면이 기기 사진첩과 백업 상태이고 백그라운드 업로드·권한·구독이 네이티브라 A도 방어할 수 있지만, B보다 위험이 큼. 어느 쪽이든 심사 메모에 네이티브 기능을 적음

## 6. 코드 재사용 (💬 추정)

- **A**: 화면·라우팅·TanStack Query·hono/client 타입·3D 보기까지 대부분(약 70–85%). 다만 기기 원본 해시·업로드는 네이티브에서 해야 함(JS로 바이트를 넘기면 비쌈). WKWebView 안의 Worker·WASM HEIC는 동작할 것으로 보나 ⚠ 미검증
- **B**: 타입·zod 스키마·hono/client·쿼리 로직(약 30–50%). 화면·3D는 새로. 대신 HEIC는 OS가 디코딩해서 WASM이 필요 없음
- 공통으로 바로 재사용: 서버 API 전부, `@nuvo/shared`(타입·zod), 구독·용량·신고 규칙

## 7. 기기 간 "같은 사진" 판정

지금 웹은 **파일 전체 sha256**으로 PC 폴더 사진과 nuvo 사진을 한 칸으로 합칩니다. 휴대폰에서는 그대로 쓰기 어렵습니다.

**사실**
- iOS 15+ `PHCloudIdentifier`(`cloudIdentifierMappings`): iCloud 사진을 쓰는 기기들 사이에서 같은 값. 조회 비용이 큼 — https://developer.apple.com/documentation/photos/phphotolibrary/cloudidentifiermappings(forlocalidentifiers:)
- Android MediaStore `_ID`는 기기 안에서만 유효하고 다시 스캔하면 바뀔 수 있음 — https://github.com/expo/expo/pull/50817
- HEIC가 JPEG로 바뀌는 경로가 있음(PHPicker `.compatible`, `requestImageDataAndOrientation`가 JPEG를 준 보고) → **바이트 해시는 PHAssetResource 원본 기준으로 고정**해야 함. expo `getUri()`는 동영상에 편집본을 기본으로 줌
- iCloud "저장 공간 최적화"면 원본이 기기에 없음 → 해시하려면 내려받아야 함(셀룰러·저장 공간)
- 참고: Immich는 서버에서 SHA-1로 사용자별 중복 판단

**💬 제안 — 3단계**
1. **빠른 키**(화면 표시·합치기 후보): 촬영 시각 + 픽셀 크기 + 파일 크기, iOS는 cloudIdentifier도
2. **확인**: OS 썸네일로 dHash(지금 웹의 유사 중복과 같은 계산)
3. **sha256**: 업로드할 때 원본 리소스 바이트로 한 번만 → 서버 중복·연결(link)·영수증은 지금 규칙 그대로

서버 쪽 변경(💬): `assets`에 빠른 키(촬영 시각·크기)는 이미 있음. 앱이 "이 빠른 키들이 nuvo에 있나"를 묻는 조회 API(내가 접근할 수 있는 라이브러리 안에서만 — 남의 사진 존재 비노출 규칙 유지)가 필요. 동영상 로드맵의 V4·V5(`source_sha256`, 빠른 식별)와 같은 문제라 함께 설계

## 8. 비교 정리 (💬)

| 기준 | A Capacitor | B Expo |
|---|---|---|
| 1만 장 그리드 | △ 파일 썸네일, 성능 근거 없음 | ○ `ph://` + 가상화 리스트 |
| 권한·iCloud·Live Photo | ○ | ◎ 공식 패키지 |
| 백그라운드 업로드 | iOS ○ / Android 포그라운드 서비스 | iOS ○ / Android 직접 구현 |
| 구독 | ◎ | ◎ |
| Better Auth | ✕ 공식 없음, 쿠키 문제 | ◎ 공식 통합 |
| 카카오 | ✕ Capacitor 8 플러그인 없음 | ○ |
| 코드 재사용 | ◎ | △ |
| 4.2 심사 | △ | ○ |

**위험**: A — WebView 그리드 성능 미검증, 인증·카카오를 직접 메워야 함, 소규모 서드파티 플러그인 의존 / B — 화면을 새로 만듦, Android 백그라운드 업로드는 직접 네이티브 모듈, Expo SDK 메이저 업그레이드가 연 3회

**💬 판단**: nuvo의 핵심이 사진첩·백그라운드 업로드·로그인이라 **B(Expo)가 유리**합니다. 11/04에 적은 "Capacitor로 시작"(화면 재사용)은 인증·카카오·그리드 성능에서 비용이 더 큽니다. 다만 결정 전에 **양쪽 모두 실기기에서 1만 장 그리드 시제품**(사진첩 권한 → 가상화 그리드 → 사진 하나 원본 업로드)을 만들어 확인하는 것을 권합니다.

## 정할 것
- [ ] 모바일 방식: Expo(💬 조사상 유리) / Capacitor — 시제품 뒤 결정
- [ ] 구독 처리: RevenueCat(무료 구간, 웹훅 하나) / 직접(Apple JWS·Google RTDN)
- [ ] 같은 사진 판정 3단계 방식 채택 여부 (동영상 V4·V5와 함께)
