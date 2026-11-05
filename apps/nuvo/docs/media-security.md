# 이미지·동영상 보안 정책 — 웹·iOS·Android

2026-11-04 작성. 상태: **제안**. OS 정책(3·4절)은 2026-11-04 조사 기준이며 출처 URL을 함께 적었습니다. "제안"은 정해지기 전까지의 기본값, `[ ]`가 정할 것입니다.
서버 쪽 구현된 보안은 [mvp.md](mvp.md) "보안 설계", 플랫폼별 기능 규칙은 [platform-policy.md](platform-policy.md), 목표는 [service-plan.md](service-plan.md).

이 문서는 **개발 단계(권한 선언·심사·비밀값)부터 서비스 이용 단계(무엇을 저장·공유·노출하는지)까지** 사진·동영상에 관한 보안과 개인정보 규칙을 플랫폼별로 적습니다. OS 정책은 바뀌니, 출시 직전에 각 절의 출처를 다시 확인합니다.

## 0. 지키는 것과 위협

**사진·동영상에 들어 있는 민감한 것**
- 사람 얼굴(아동 포함), 집 내부, 신분증·영수증 같은 문서
- **촬영 위치(EXIF GPS)**, 촬영 시각, 기기 정보. 위치는 집·학교·직장을 드러냅니다
- 동영상은 소리(대화)도 들어 있습니다

**막아야 할 일**
| 위협 | 지금 막는 방법 | 더 할 것 |
|---|---|---|
| 남의 사진을 보는 것 | 서명 URL(HMAC, 6~12시간 만료), 라이브러리 권한 검사, 해시만으로 존재 여부 못 알게 함 | 그대로 |
| 초대 링크 유출 | 7일·10명 제한, 역할 editor/viewer만 | 아래 2.3 |
| 올린 파일로 스크립트 실행 | 미디어 응답 `CSP sandbox`·`nosniff`, 이미지 형식만 허용 | 아래 1.2 |
| 위치가 의도 없이 공유됨 | **막는 것 없음** — 원본 EXIF 그대로 저장, Space로 보내면 lat/lng도 복사됨 | 아래 2.1 |
| 기기 분실·공유 PC | 세션 쿠키 캐시 없음(즉시 로그아웃 반영) | 아래 1.3·3·4 |
| 검색엔진 색인 | 미구현 (mvp.md "검색 노출") | 기본 noindex |
| 운영자(나)의 접근 | R2·DB에 원본과 메타데이터가 평문 | 아래 1.4 |

## 1. 공통 (서버·저장·개발)

플랫폼과 상관없이 서버가 지키는 규칙입니다. 앱이라고 서버 검증을 건너뛰는 경로는 만들지 않습니다(platform-policy.md 원칙).

### 1.1 저장
- 원본은 R2 `o/{sha256}`, 썸네일 `t/{sha256}/{size}`. 내용 주소라 URL 추측이 안 됩니다
- R2는 서버 측 암호화(AES-256)가 기본입니다. 추가로 **클라이언트 측(E2E) 암호화는 하지 않습니다**(제안) — Space 공유, 썸네일, 중복 정리, 나중의 분류가 서버·다른 기기에서 읽을 수 있어야 하기 때문입니다. 약관·개인정보처리방침에 "운영자는 저장된 사진에 기술적으로 접근할 수 있다"를 숨기지 않고 적습니다
- [ ] E2E 암호화 안 함 확정 (제안: 안 함)

### 1.2 업로드 검증
- 지금: `Content-Type` 헤더로만 형식을 검사합니다(`SUPPORTED_MIME`). 응답에 `sandbox`·`nosniff`가 있어 스크립트 실행은 막힙니다
- 제안: 서버에서 **앞부분 바이트(매직 넘버)로 형식을 확인**하고 헤더와 다르면 415. 동영상(`video/mp4`)을 허용하면 더 필요합니다(ftyp 박스 확인)
- 제안: 썸네일은 서버가 다시 디코딩하지 않으니(브라우저가 만듦) 크기 상한(4MB)과 형식(WebP)만 검사 — 지금과 같음. 서버 썸네일 생성으로 바꾸면 그때 디코더 취약점(이미지 폭탄)을 함께 봅니다
- SVG는 허용 목록에 없고 앞으로도 넣지 않습니다(스크립트 포함 가능)

### 1.3 인증·세션
- 웹: 쿠키 세션(Better Auth), 캐시 없음. 비밀번호 재설정 시 전체 로그아웃
- 앱: 토큰 방식(platform-policy.md 6). 토큰은 OS 보안 저장소에만(3.4·4.4). 토큰 만료·회전 정책은 앱 설계 때 정합니다
- [ ] 앱 토큰 수명 (제안: 리프레시 30일, 액세스 1시간)

### 1.4 운영자 접근과 로그
- 운영자가 사진을 열어 보는 일은 **장애 대응과 법적 요청에만** 하고, 열어 본 기록을 남깁니다(제안). 지금은 Cloudflare 대시보드로 R2를 직접 열 수 있고 기록이 없습니다
- Workers 로그에 사진 내용·위치·파일 이름을 남기지 않습니다. 지금 `[guard]`·`[budget]` 로그는 경로와 사유만입니다. 유지합니다
- [ ] 운영자 접근 기록 방법 (R2 접근 로그 / 대시보드 접근을 2인 승인 — 1인 운영이라 현실적으로는 "접근 사실을 수동 기록")

### 1.5 개발 단계
- 비밀값은 `.dev.vars`·Cloudflare Secrets에만(README). 앱에는 **서버 비밀값을 절대 넣지 않습니다** — 앱 바이너리는 누구나 풉니다. 앱이 가진 건 자기 로그인 토큰과 공개 가능한 OAuth 클라이언트 ID만
- 미디어 서명 키(`MEDIA_SIGNING_KEY`)는 서버 전용. 앱이 URL을 직접 서명하지 않습니다
- 의존성: 이미지·동영상 파서(exifr, HEIC WASM, mp4 파서)는 취약점 공지를 추적합니다. `pnpm audit`을 CI 또는 배포 전에 돌립니다
- 테스트 사진: 실제 가족 사진을 저장소·CI·스크린샷에 넣지 않습니다. 샘플은 직접 찍은 풍경이나 생성 이미지
- 스토어 심사용 데모 계정에는 가짜 사진만

## 2. 서비스 이용 (저장·공유·노출 정책)

### 2.1 위치 등 메타데이터
지금 동작: 브라우저가 EXIF에서 촬영 시각·GPS·카메라를 읽어 DB `assets`에 저장하고, **원본 파일에는 EXIF가 그대로** 남습니다. Space로 보내면(`/assets/copy`) lat/lng·카메라가 함께 복사되고, Space 멤버가 조회할 때 lat/lng가 응답에 포함됩니다.

제안:
| | 내 사진함 | Space |
|---|---|---|
| DB 위치(lat/lng) | 저장 (지도 보기·여행 묶기용) | **복사하지 않음** (기본값). 보낼 때 "위치도 공유" 선택 가능 |
| 원본 파일 EXIF | 그대로 (백업은 원본 보존이 목적) | **공유용은 위치 EXIF 제거** 여부를 정해야 함 — 원본 그대로 공유하면 받은 사람이 위치를 알 수 있음 |
| 다운로드 | 원본 그대로 | 위 결정에 따름 |
| 화면 표시 | 지도·장소 표시 | 위치 공유를 켠 사진만 |

- Space 공유에서 원본 EXIF를 지우려면 사본을 만들어야 해서(해시가 바뀜) 지금의 "같은 Blob 참조, 복사 없음" 구조와 충돌합니다. 선택지: (a) 그대로 두고 공유 전 안내만, (b) 보내는 쪽 브라우저가 위치 제거본을 새로 올림(용량 2배), (c) 서버가 다운로드 시점에 EXIF를 벗겨 줌(Worker CPU, 형식마다 구현)
- [x] Space로 보낼 때 DB 위치 기본값: 복사 안 함, 보낼 때 "위치도 공유" 선택 옵션 — 11/05 결정(D-016)
- [ ] Space 공유 원본의 EXIF 위치: (a) 안내만 / (b) 제거본 업로드 / (c) 다운로드 시 제거. 제안: MVP는 (a) + Space 사진은 **다운로드를 기본 끔**(2.4)
- 모바일 앱은 OS가 위치 EXIF를 따로 보호합니다(3.1·4.2). 앱이 위치를 읽을 권한을 받지 않으면 애초에 위치가 들어오지 않습니다 — 그 경우 서버 DB에도 위치가 없는 상태가 기본이 됩니다

### 2.2 얼굴·내용 분석
- 지금 하지 않습니다. 얼굴 인식은 생체정보로 별도 동의와 법률 검토([developer-guide.md](developer-guide.md) 14단계, [roadmap](roadmap-video-classification.md) 3단계)
- 기기 안 분류(CLIP 등)는 사진이 밖으로 나가지 않으니 동의 부담이 작지만, 결과(태그)를 서버에 저장하면 그건 개인정보입니다. 저장 여부는 분류 설계 때 정합니다

### 2.3 공유(Space·초대 링크)
- 지금: 초대 링크 7일·10명, 역할 editor/viewer. 링크를 가진 사람은 누구나 가입 후 참여
- **스토어 심사 요건(3.3·4.4): 사진 신고 기능, 멤버 차단, 공개 연락처, 업로드 전 약관 동의.** 가족 비공개 Space도 두 스토어 모두 UGC로 봅니다. 신고는 Space 소유자와 운영자에게 전달되고, 운영자가 확인 뒤 삭제·계정 제한을 할 수 있어야 합니다. 신고 처리 기한(예: 24시간 안 1차 확인)을 약관에 적습니다
- 제안 추가: 소유자가 **초대 링크를 즉시 무효화**할 수 있는 버튼(지금 만료만 있음), 멤버 목록에서 **누가 어느 링크로 들어왔는지** 표시, 새 멤버 참여 시 소유자 알림(Space 피드에 이미 활동이 남는지 확인)
- Space는 **비공개만**. 공개 링크(로그인 없이 보기, "게스트 링크")는 로드맵에서 뺀 상태를 유지하고, 넣을 때 이 문서를 먼저 고칩니다
- 멤버가 올린 사진은 그 멤버가 나가도 Space에 남습니다(developer-guide 14). 이것을 올리기 전에 한 번 안내합니다
- [x] 신고·차단·공개 연락처 — 11/05 구현(D-018, work-plan ⑤). 약관 동의는 ④와 함께 남음
- [ ] 초대 링크 즉시 무효화·참여 알림 (제안: 넣음)
- [ ] 아동 사진이 많은 Space에 대한 추가 안내 문구 (법률 검토와 함께)

### 2.4 다운로드·화면 캡처
- 서명 URL은 6~12시간 뒤 만료, 브라우저 캐시 `private`. 링크를 복사해 보내도 곧 죽습니다. 유지합니다
- 받은 원본 파일은 nuvo가 더 통제할 수 없습니다. "다운로드 금지"는 기술적으로 완전하지 않으니(화면 캡처), **권한 표시와 기록**으로 다룹니다
- 제안: Space 사진의 원본 다운로드는 **역할 editor 이상**만(viewer는 화면 보기만). 소유자가 Space 설정에서 바꿀 수 있게
- 화면 캡처 차단(iOS 감지, Android `FLAG_SECURE`)은 **하지 않습니다**(제안) — 가족 사진 서비스에서 사용자가 자기 사진을 캡처하는 걸 막는 건 불편만 늘립니다
- [ ] Space 다운로드 권한 기본값 (제안: editor 이상)
- [ ] 화면 캡처 차단 안 함 확정

### 2.5 삭제·보존
- 삭제는 즉시, 마지막 참조가 사라지면 R2에서도 바로 삭제. 엣지 캐시는 최대 하루 남음(mvp.md). 휴지통 도입 시 "휴지통에 있는 동안은 서명 URL로 접근 불가"를 규칙에 넣습니다
- 계정 삭제는 개인 사진함 즉시 삭제, Space 사진은 남음(고지 필요)
- 구독 해지 뒤 보관·삭제 기간은 service-plan.md "정할 것"
- 백업(DB 스냅샷·R2 복제)을 두면 거기에 남는 기간도 개인정보처리방침에 적습니다. 지금은 Neon 자동 백업만 있고 R2 복제는 없습니다
- [ ] Neon 백업 보존 기간 확인·명시

### 2.6 노출(검색·미리보기)
- 기본 noindex, `/invite/*`·`/m/*`는 절대 색인 금지(mvp.md "검색 노출")
- 초대 링크를 메신저에 붙일 때 생기는 **링크 미리보기(OG)**에 사진이 보이면 안 됩니다. `/invite/*`에는 Space 이름·초대한 사람만 넣고 사진은 넣지 않습니다(제안). 메신저 봇이 `/m/*`를 긁어가도 서명이 없으면 403

## 3. iOS 앱

2026-11-04 조사. 기준은 App Store Review Guidelines(2026-10-16 개정) https://developer.apple.com/app-store/review/guidelines/ . **⚠️**는 2025~2026 변경 또는 불확실.

### 3.1 사진 보관함 권한 (개발 단계)
- 권한 상태는 `.authorized`(전체) / `.limited`(선택한 사진만, iOS 14+) / `.denied` 등. 반드시 접근 레벨 인자가 있는 `requestAuthorization(for:)`를 써야 `.limited`를 구분합니다. 읽기는 `NSPhotoLibraryUsageDescription`, 저장만 하면 `NSPhotoLibraryAddUsageDescription`. 키가 없으면 크래시 https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app
- 심사 5.1.1(iii) 데이터 최소화: "가능하면 전체 접근 대신 picker(`PHPickerViewController`, 권한 창 없음)를 쓰라". nuvo는 "내 보관함을 앱에서 보는 것"이 핵심이라 전체 접근을 정당화할 수 있지만, **권한 문구에 구체 용도**를 적고(5.1.1(ii)), **거부·limited 상태에서도 동작하는 화면**이 있어야 합니다(5.1.1(iv)) — platform-policy.md 1의 "선택한 사진만 보여주고 넓히기 안내"가 그 화면
- limited 모드: 시스템이 앱 실행마다 "선택 변경" 알림을 자동으로 띄우니 `PHPhotoLibraryPreventAutomaticLimitedAccessAlert = YES`로 끄고, 앱 안 버튼으로 `presentLimitedLibraryPicker`를 띄웁니다
- ⚠️ iOS 17부터 시스템이 전체 접근 앱에 **주기적으로 "유지/제한" 재확인**을 띄웁니다(Apple 개발자 문서에는 없고 지원 문서·보도로만 확인). 사용자가 limited로 바꾸면 앱이 그 전환을 처리해야 합니다 — 인덱스에서 사라진 사진은 "접근 불가"로 표시하고 서버 기록은 지우지 않습니다(제안)
- 5.1.2(vi): 사진 API로 얻은 데이터를 마케팅·광고·데이터 마이닝에 쓰지 못합니다. 2.2의 "기기 안 분류 결과를 서버에 저장할지"를 정할 때 이 조항을 봅니다

### 3.2 위치 EXIF와 프라이버시 선언 (2.1과 연결)
- Privacy Manifest(`PrivacyInfo.xcprivacy`)에 수집 데이터 타입과 Required Reason API를 선언하고, 그걸 바탕으로 영양 라벨을 씁니다. 사진은 `NSPrivacyCollectedDataTypePhotosorVideos`. Capacitor·RN과 SDK가 쓰는 UserDefaults·파일 타임스탬프는 Required Reason 선언 필수(2024-05부터) https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- 영양 라벨 정의: **Precise Location = 위·경도 소수점 3자리 이상**. 기기 안에서만 처리하면 "수집"이 아닙니다 https://developer.apple.com/app-store/app-privacy-details/
- ⚠️ Apple은 EXIF GPS를 따로 다루지 않습니다. 원본을 그대로 백업하면 소수점 3자리 이상 좌표가 서버로 가니 **"Precise Location 수집(linked, App Functionality)"으로 신고하는 것이 안전한 해석**입니다. 피하려면 업로드 때 좌표를 지우거나 축약해야 하는데, 그건 "백업은 원본 보존"과 충돌합니다
- 제안: iOS 백업은 원본을 보존하고 **Precise Location을 신고**합니다. Android(4.2)에서 `ACCESS_MEDIA_LOCATION`을 빼면 두 플랫폼의 신고 내용이 달라지는데, 그건 정상입니다(플랫폼마다 폼이 따로). 사용자에게 보이는 규칙은 2.1 하나로 통일
- [ ] iOS: 원본 보존 + Precise Location 신고 (제안) / 업로드 때 좌표 제거

### 3.3 심사 규정 — 로그인·계정 삭제·UGC (서비스 설계에 영향)
- **4.8 로그인 서비스: Google·카카오로 주 계정을 만들면 Sign in with Apple을 함께 제공해야 합니다.** 예외(자사 계정만 쓰는 경우 등)는 nuvo에 해당하지 않습니다. → 앱 출시 전 **애플 로그인 추가 필수**(Better Auth가 지원). 한국 개발자는 Services ID 등록 때 **서버 간 알림 엔드포인트**(계정 변경 통지)를 넣어야 합니다
- **5.1.1(v) 계정 삭제**: 앱 안에서 삭제를 시작할 수 있어야 하고, 설정에서 찾기 쉬워야 합니다(지금 "설정 → 계정 삭제" 있음). Sign in with Apple 사용자는 삭제 때 REST API로 토큰 폐기. 구독은 Apple 쪽 해지 안내(`showManageSubscriptions`) https://developer.apple.com/support/offering-account-deletion-in-your-app/
- **1.2 UGC**: 가족 Space도 UGC입니다. 필수 네 가지 — 부적절 콘텐츠 **필터링 수단**, **신고 + 적시 대응**, **사용자 차단**, **공개 연락처**. ⚠️ 2026-10-16 개정으로 비동의 성적 이미지(AI 생성 포함) 삭제 의무와 "통지 후 미조치는 개발자 행동 규범 위반" 문구가 추가됐습니다. 지금 nuvo에 신고 기능이 없는 것은 Android(4.4)와 같은 공백 — **한 번 만들어 두 스토어에 씁니다**
- 4.2 최소 기능·2.5.6 WebKit: Capacitor·RN 래퍼는 "웹사이트 재포장" 거절 위험이 있습니다. 사진 보관함 네이티브 접근, 백그라운드 업로드, 오프라인 동작이 차별 근거가 되니 심사 메모에 적습니다
- [ ] Sign in with Apple 추가 (앱 출시 전 필수)
- [ ] 신고·차단·공개 연락처 (iOS·Android 공통, 2.3에 반영)

### 3.4 결제
- 3.1.1: 디지털 구독은 IAP 필수. ⚠️ **미국 스토어만**(2025-05-01 Epic 판결 이후) 외부 결제 버튼·링크 허용, 수수료는 소송 중(연방대법원 2026~27 심리) — 불확실. **한국 스토어는 외부 링크 금지**가 유지됩니다
- 웹에서 산 구독에 "로그인만" 하는 앱: Reader 앱(3.1.3(a))은 잡지·책·음악·영상으로 한정돼 사진 백업은 **해당 없음**. 대신 **3.1.3(b) 멀티플랫폼 서비스**: 웹 구독자를 앱에서 쓰게 할 수 있지만 **같은 구독을 앱 안 IAP로도 팔아야** 합니다. 앱 안에서 웹 결제 유도는 금지(미국 제외), 앱 밖(이메일 등) 안내는 가능
- 11/04 결정: **결제는 앱 스토어에서만** — iOS는 IAP, Android는 Google Play 결제, 웹은 결제 없이 앱 설치 안내([service-plan.md](service-plan.md) "결제 구조"). 그래서 3.1.3(b)의 "웹에서 산 구독" 문제가 생기지 않고, 앱 안 IAP가 유일한 결제라 심사 쟁점이 단순해집니다. 가격은 IAP 수수료(소규모 15%)를 감안해 정합니다
- [x] iOS IAP 구독 도입 (11/04 결정)
- [ ] 두 스토어 가격 동일 (제안: 동일)

### 3.5 백그라운드 업로드 (자동 백업)
- `URLSession` 백그라운드 세션: 앱이 종료돼도 시스템이 전송을 이어갑니다. 제약 — **업로드는 파일 기반(`uploadTask(fromFile:)`)만**, delegate 필수, HTTPS. 앱이 백그라운드에서 재시작될 때마다 다음 전송이 더 지연되는 **rate limiter**가 있어, 수천 개 작은 전송보다 **세션 하나에 태스크를 한 번에 많이 넣는** 쪽이 유리 https://developer.apple.com/documentation/foundation/downloading-files-in-the-background
- `BGProcessingTaskRequest`: 충전·유휴 때 "수 분" 실행, 시점 보장 없음. ⚠️ iOS 26 `BGContinuedProcessingTask`: 사용자가 포그라운드에서 시작한 작업을 Live Activity로 진행률을 보이며 이어감 — **첫 대량 백업**에 맞습니다 https://developer.apple.com/documentation/backgroundtasks/bgcontinuedprocessingtask
- 현실: 앱이 실행 중일 때만 사진 변경(`PHPhotoLibraryChangeObserver`)을 감지합니다. **앱이 꺼진 상태에서 "새 사진 즉시 업로드"는 불가능**합니다(iCloud 사진 같은 시스템 권한 없음). 사용자가 강제 종료하면 백그라운드 재실행도 안 됩니다. → platform-policy.md 2의 "자동 백업"은 "앱을 열 때·충전 중 유휴 때 이어서 올림"으로 문구를 맞춥니다
- iCloud "저장 공간 최적화"로 원본이 기기에 없으면 `isNetworkAccessAllowed = true`로 내려받아야 합니다(기본 false). 셀룰러·저장 공간을 쓰니 사용자 설정과 연결 https://developer.apple.com/documentation/photos/phimagerequestoptions/isnetworkaccessallowed
- [ ] 자동 백업 문구: "즉시"가 아니라 "앱을 열 때·충전 중"으로 (제안)

### 3.6 보안 구현
- 토큰: Keychain. **백그라운드 업로드가 잠금 중에도 토큰을 읽어야 하니 `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`**(기본 `WhenUnlocked`는 잠금 중 실패). `ThisDeviceOnly`라 다른 기기 백업 복원에서 제외됨 — 새 기기에서는 다시 로그인 https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility
- 업로드 대기 파일의 Data Protection은 앱 기본(`completeUntilFirstUserAuthentication`) 또는 `completeUnlessOpen`
- ATS: HTTPS·TLS 1.2+ 필수. `NSAllowsArbitraryLoads`는 쓰지 않습니다. 인증서 고정은 Android와 같은 이유로 안 함(제안)
- Live Photo: `PHAssetResource`로 `.photo` + `.pairedVideo` 두 리소스를 꺼내 **원본 바이트 그대로** 백업하고, 복원도 두 리소스를 함께 추가. HEIC·HEVC 원본은 같은 경로로 추출(변환 없이). roadmap V6의 Live Photo 모델은 이 두 리소스를 담아야 합니다
- 화면 캡처: 사후 통지(`userDidTakeScreenshotNotification`)만 가능하고 차단은 불가. 2.4 결정(차단 안 함)과 일치
- 사진첩에 저장(내보내기): `.addOnly` 권한 + `NSPhotoLibraryAddUsageDescription`. readWrite가 이미 있으면 불필요. 사용자가 "저장"을 누른 시점에 요청

### 3.7 미성년·연령 등급
- Kids 카테고리가 아니어도 **5.1.4(b)**: 미성년자 개인정보를 수집·전송할 수 있는 앱은 개인정보 정책 필수 + 관련 법 준수. 메타데이터에 "For Kids" 표현 금지(2.3.8)
- ⚠️ 연령 등급 개편(2025-07-24): 4+/9+/**13+/16+/18+**, 신규 설문 필수(2026-01-31까지). UGC·공유 기능 때문에 **13+ 이상**이 나올 수 있습니다. 가족 공유는 미성년 사용자를 가정하므로 1.2.1(a)/4.7.5 연령 기반 제한 조항(2025-11-13 추가)을 봅니다 https://developer.apple.com/news/?id=ks775ehf
- ⚠️ 미국 주법(텍사스 2026-01, 유타, 루이지애나)의 연령 확인 요구는 한국 출시만이면 직접 영향이 적습니다
- [ ] 연령 등급 설문 답과 목표 등급 (제안: 13+ 수용)

## 4. Android 앱

2026-11-04 조사, 같은 날 Play Console 도움말 원문으로 재확인(◎). 출처는 각 항목 끝. 일부 도움말 URL이 통합 페이지로 바뀌어 새 주소를 적었습니다.

### 4.1 사진·동영상 권한 (개발 단계 — 심사 통과의 핵심)
- Play "사진·동영상 권한" 정책: `READ_MEDIA_IMAGES`·`READ_MEDIA_VIDEO`는 **시스템 포토 피커로 대체할 수 없는 핵심 기능이 지속적으로 사진 전체에 접근해야 할 때만** 선언할 수 있습니다. 가끔 한 장 고르는 용도는 포토 피커 의무. 2025-05-28부터 전면 시행, Play Console "App content"의 **선언 폼**에서 "왜 포토 피커로는 부족한지"를 입증해야 합니다(원문: 선언 폼의 세부 질문이나 시연 영상 요구는 없음). 자체 피커 UI만으로는 자격이 안 되고, 권한을 거부한 사용자를 위한 대안(시스템 피커)을 둬야 합니다 ◎ https://support.google.com/googleplay/android-developer/answer/16935362 (옛 14115180에서 통합)
- 원문의 적격 예시는 **"사용자의 모든 사진·동영상을 관리·유지하는 것이 핵심 기능인 앱(갤러리 앱)"**이라 nuvo의 "기기 사진첩을 앱에서 보기"는 여기에 해당합니다. "백업"은 사진 권한 정책에 **언급이 없습니다**(백업은 All files access 정책에만 나옴) — 그래서 선언 폼에는 **갤러리(타임라인·중복 정리)를 핵심 기능으로** 적고 백업은 부가로 적습니다(제안)
- Android 14+ 부분 접근: `READ_MEDIA_VISUAL_USER_SELECTED`를 함께 선언해 "일부만 선택"을 앱이 다룹니다. 권한 상태는 저장하지 말고 화면에 돌아올 때마다(`onResume`) 다시 확인 https://developer.android.com/about/versions/14/changes/partial-photo-video-access
- `MANAGE_EXTERNAL_STORAGE`(모든 파일 접근)는 미디어 용도로 **불허**. 요청하지 않습니다 ◎ https://support.google.com/googleplay/android-developer/answer/10467955 (원문: 불허 사례에 "Media Files access" 명시, MediaStore 사용 안내)
- Capacitor·RN으로 감싸도 manifest·targetSdk·선언 폼은 똑같이 적용됩니다. 서드파티 SDK가 manifest 병합으로 권한을 끼워 넣어도 정책 대상이니 빌드 결과 manifest를 확인합니다

### 4.2 위치 EXIF (2.1과 연결)
- Android 10+는 다른 앱이 만든 사진의 **위치 EXIF를 기본으로 지워서** 줍니다. 원본 위치를 읽으려면 `ACCESS_MEDIA_LOCATION` 권한 + `MediaStore.setRequireOriginal()`이 필요합니다 https://developer.android.com/training/data-storage/shared/media
- 제안: **`ACCESS_MEDIA_LOCATION`을 처음에는 요청하지 않습니다.** 그러면 Android 앱에서 올라가는 백업에는 위치가 없고, Data safety에서 "위치 수집"을 신고하지 않아도 됩니다. 지도 보기·여행 묶기를 앱에서 쓰려면 그때 권한을 추가하고 신고도 바꿉니다. 단, 이렇게 하면 **같은 사진이 웹 PC에서 올라가면 위치가 있고 앱에서 올라가면 없는** 차이가 생깁니다 — 사용자에게 보이는 규칙은 "위치는 내 사진함에서만, Space에는 안 감"(2.1)으로 통일합니다
- [ ] `ACCESS_MEDIA_LOCATION` 첫 출시 제외 (제안: 제외)

### 4.3 Data safety·계정 삭제·개인정보 (심사 선언)
- Data safety 폼: 로컬 열람만이면 사진은 "수집"이 아닙니다(기기 밖으로 안 나감). **백업 업로드는 "Photos and videos" 수집**, 위치 EXIF가 올라가면 **"Precise location" 수집**으로 신고. manifest 권한과 신고 내용이 다른 것이 흔한 거절 사유. 원문 정의: "수집 = 기기 밖으로 전송", 기기 안 처리만이면 신고 불요, 메모리에서만 잠깐 쓰는 "임시 처리"는 폼에는 적되 공개되지 않음. 사진으로 인종 등 특성을 추정하면 그것도 신고 ◎ https://support.google.com/googleplay/android-developer/answer/10787469
- 계정 삭제: **앱 안 삭제 경로 + 앱 밖 웹 링크** 둘 다 필수(이미 시행). 웹 페이지에 앱·개발자 이름이 보여야 하고, 비활성화는 인정 안 됨(User Data 정책 10144311). 앱 안 삭제가 완전해도 웹 링크는 별도 필수(앱을 지운 사용자용). 지금 "설정 → 계정 삭제"는 있고, **웹 삭제 페이지**가 추가로 필요합니다 ◎ https://support.google.com/googleplay/android-developer/answer/13327111
- 사진·위치는 "개인·민감 정보"라 개인정보처리방침 링크(스토어 + 앱 안)와 눈에 띄는 고지·동의가 필요합니다(developer-guide 14단계와 같은 작업)
- [ ] 계정 삭제 웹 페이지 (로그인 후 삭제 / 이메일 요청 폼)

### 4.4 UGC·아동 안전 (서비스 이용 규칙에 영향)
- UGC 정책: 원문 정의가 "**앱 사용자 중 일부에게라도** 보이는 콘텐츠"라 비공개 가족 Space도 범위 안입니다. 요건은 업로드 전 약관 동의, 금지 콘텐츠 정의, **앱 안 신고·차단과 조치**. 특정 사용자 집합만 쓰는 앱(학교·회사·가족)은 "콘텐츠·사용자 신고"가 최소 요건이고, 1:1 상호작용이 있으면 차단도 필요합니다 ◎ https://support.google.com/googleplay/android-developer/answer/9876937
  - 지금 nuvo에는 **신고 기능이 없습니다.** Space 안에서 사진 신고 → 소유자·운영자에게 전달, 멤버 차단(내보내기는 있음)을 넣어야 합니다
- Child Safety Standards(CSAE): 원문 범위는 **익명·랜덤 채팅 앱과 Social·Dating 카테고리 앱**(아동 사용자 유무 무관). 2026-10-29 발효 정책에도 같은 범위라, 앞서 "2026 범위 확대"로 봤던 것은 **공식 페이지로 확인되지 않습니다**. 요건은 공개 CSAE 표준 페이지(앱·개발자명 포함, Console에 링크 제출), 앱 안 피드백 경로, CSAM 조치, 아동 안전법 준수, 담당자 등록. nuvo는 **"사진" 카테고리로 등록**해 범위 밖에 두되, Child Endangerment 정책(CSAM 무관용, NCMEC 등 신고)은 모든 앱에 적용되니 신고 처리 절차는 어차피 필요합니다 ◎ https://support.google.com/googleplay/android-developer/answer/14747720 , https://support.google.com/googleplay/android-developer/answer/9878809
- [ ] 사진 신고·멤버 차단 기능 (제안: 앱 출시 전 필수)
- [ ] 스토어 카테고리: 사진 (제안)

### 4.5 결제
- 앱 안에서 디지털 구독을 팔면 Play Billing 필수 — 원문 예시에 "구독 서비스"와 "**클라우드 소프트웨어·서비스(데이터 저장 서비스 등)**"가 명시돼 nuvo가 정확히 해당합니다. 소비 전용 앱(앱 안에서 아무것도 못 삼)은 허용되고 링크 없는 안내 문구만 가능. 외부 결제 유도 금지 범위는 스토어 등록정보·웹뷰·버튼·링크·메시지·광고·가입 흐름까지 ◎ https://support.google.com/googleplay/android-developer/answer/9858738 , FAQ https://support.google.com/googleplay/android-developer/answer/10281818
- 지역별 대체 결제는 2025~2026에 계속 바뀌고 있습니다(미국 외부 링크 허용 → 수수료 프로그램, EEA Billing Choice, **한국은 2026-12-31 Billing Choice 적용 예정 + 2026-10-28 방미통위 아웃링크 결제 제공 명령**, 수수료 미정). 출시 시점에 다시 확인
- 11/04 결정: Android 앱 안에서 구독을 팔기로 했으므로 **Google Play 결제 연동이 필수**입니다(소비 전용 아님). 한국은 Billing Choice(2026-12-31~) 또는 방미통위 아웃링크 명령에 따른 대체 결제가 열릴 수 있으나 수수료·시행이 미정 — 1차는 Play 결제 기본으로 가고 대체 결제는 출시 시점에 다시 봅니다
- [x] Google Play 결제 연동 (11/04 결정)

### 4.6 백그라운드 업로드 (자동 백업)
- 선택지: **WorkManager**(10분 미만 작업 단위, 충전·Wi-Fi 같은 제약 조건, 시스템이 취소·재시도) / **User-Initiated Data Transfer Job**(사용자가 시작한 전송, 진행 알림 필수, Android 14+) / 포그라운드 서비스는 최후 수단 https://developer.android.com/develop/background-work/background-tasks/data-transfer-options
- `dataSync` 포그라운드 서비스는 Android 15+ 타겟에서 **24시간 중 6시간** 제한, 부팅 때 시작 불가, Play Console에 기능 설명·중단 시 영향·**시연 동영상**·사용 사례 선언 필요. 원문이 "백업·복원" 사례를 **사용자가 직접 시작한 작업용**으로 한정하고("특정 사진을 골라 백업 vs 매일 새 사진 자동 백업"), 영상에 "완전 자동·백그라운드 백업을 보여줄 수 없다"고 못박습니다. 사용자가 시작한 전송이면 dataSync 대신 **user-initiated data transfer job**을 권장 ◎ https://support.google.com/googleplay/android-developer/answer/13392821 , https://developer.android.com/develop/background-work/services/fgs/service-types
- 제안: 자동 백업은 **WorkManager + 제약 조건(Wi-Fi, 배터리 부족 아님)**으로 만들고, 사진을 작은 묶음으로 나눠 10분 안에 끝나게 합니다. 포그라운드 서비스 선언은 피합니다. platform-policy.md 2의 "Wi-Fi에서만·저전력 멈춤" 기본값과 맞습니다
- [ ] WorkManager 방식 확정

### 4.7 보안 구현
- 토큰 보관: `EncryptedSharedPreferences`(security-crypto)는 **2025-07 전체 deprecated**. **Android Keystore를 직접** 쓰고(StrongBox 있으면 사용, 없으면 TEE), 암호화한 값을 DataStore 등에 저장 https://developer.android.com/jetpack/androidx/releases/security
- 네트워크: API 28+는 평문 HTTP 기본 차단. Android 17(API 37)부터 Certificate Transparency·ECH 기본 활성. 인증서 고정(pinning)은 만료일·백업 핀 없이 하면 서비스가 멈출 수 있어 **하지 않음**(제안) https://developer.android.com/privacy-and-security/security-config
- Play Integrity: 1차에는 넣지 않습니다(제안). 서버 검증이 이미 요청마다 있고, 통합 비용 대비 막는 위협(변조 앱)이 가족 사진 서비스에서 크지 않습니다
- 화면 캡처: `FLAG_SECURE`로 차단 가능하지만 2.4 결정대로 **쓰지 않음**
- 형식: HEIC 디코딩은 Android 9+이지만 **기기 선택 사항**(`ImageDecoder.isMimeTypeSupported`로 확인). Motion Photo는 JPEG/HEIC 뒤에 MP4가 붙은 한 파일 — 백업은 **원본 바이트 그대로** 보존해야 모션이 살아 있습니다(roadmap V6 Live Photo와 함께 다룸) https://developer.android.com/media/platform/motion-photo-format
- targetSdk: **2026-08-31부터 신규 앱·업데이트는 Android 16(API 36) 필수**, 연장 신청 시 2026-11-01까지 — 지금 출시하면 36 ◎ https://support.google.com/googleplay/android-developer/answer/11926878

## 5. 웹 (브라우저)

### 5.1 기기 사진 읽기
- 웹 PC: File System Access API 폴더 핸들. **읽기 전용(`mode: "read"`)만** 요청합니다(지금 코드 `store.ts`). 쓰기 권한은 받지 않습니다 — nuvo는 기기 파일을 지우지 않는다는 원칙과 맞고, 브라우저 권한 창에도 "읽기"만 뜹니다
- 핸들은 IndexedDB에 저장되고 **같은 브라우저 프로필을 쓰는 사람 모두**가 봅니다(mvp.md "기기 단위 공유", 11/04 결정). 공용 PC에서는 폴더를 연결하지 말라는 안내를 첫 연결 때 한 번 보여줍니다(제안)
- 썸네일·인덱스는 IndexedDB에 평문입니다. 브라우저 프로필에 접근할 수 있으면 읽을 수 있습니다. OS 계정 잠금에 의존합니다 — 웹에서 더 할 방법이 없습니다
- "연결 해제"는 핸들과 인덱스·썸네일을 모두 지웁니다(`store.ts` `removeFolder` — folders·items·thumbs 세 저장소를 함께 삭제, 확인함)
- [ ] 공용 PC 안내 문구

### 5.2 브라우저 보안 헤더
- 정적 응답 `_headers`: `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`(카메라·마이크·위치 끔). 유지
- 미디어 응답: `CSP sandbox`, `nosniff`, `private` 캐시. 유지. 동영상을 넣어도 같은 헤더(roadmap V7)
- 제안: SPA 자체에 `script-src 'self'` CSP 추가. 지금은 `frame-ancestors`·`base-uri`·`object-src`·`form-action`만 있고 `script-src`가 없어 XSS가 나면 막을 게 없습니다. Vite 빌드는 인라인 스크립트가 없어 넣을 수 있고, `index.html`의 테마 스크립트만 해시나 외부 파일로 빼면 됩니다
- `Referrer-Policy`: `/m/*` 서명 URL이 Referer로 다른 사이트에 나가지 않게 — `strict-origin-when-cross-origin`이라 경로는 안 나갑니다. 유지
- [ ] `script-src` CSP 도입 (제안: 넣음)

### 5.3 파일 처리 중 위험
- HEIC 디코딩·EXIF 파싱은 Web Worker에서 합니다. 악성 파일로 Worker가 죽어도 페이지는 살아 있고, 서버에는 영향이 없습니다. 유지
- 폴더 스캔 때 파일 이름·경로는 서버로 보내지 않습니다. 보내는 건 해시만(mvp.md). 업로드할 때만 파일 이름이 갑니다
- 클립보드·드래그로 들어온 파일도 같은 검증(형식·크기)을 거칩니다

### 5.4 세션
- 쿠키 세션. 공용 PC를 위한 "모든 기기에서 로그아웃"은 비밀번호 재설정으로만 됩니다. 설정에 **세션 목록과 개별 로그아웃**을 넣습니다(제안, Better Auth가 세션 목록 API를 제공)
- [ ] 세션 목록·개별 로그아웃 (제안: 넣음)

## 6. 정리 — 플랫폼별 차이 한눈에

| | 웹 | iOS 앱 | Android 앱 |
|---|---|---|---|
| 기기 사진 권한 | 폴더 읽기(브라우저 권한 창), 읽기 전용 | 전체 / 선택한 사진만(limited). 주기적 재확인 프롬프트. 거부·limited 대안 화면 필수 | `READ_MEDIA_IMAGES/VIDEO` + `VISUAL_USER_SELECTED`. Play 선언 폼 심사(갤러리가 핵심 기능) |
| 위치 EXIF | 파일에 있으면 그대로 읽힘 | 원본에 그대로 → Precise Location 신고 | OS가 기본 제거. `ACCESS_MEDIA_LOCATION` 첫 출시 제외(제안) → 위치 없음 |
| 토큰·세션 보관 | 쿠키 | Keychain `AfterFirstUnlockThisDeviceOnly` | Android Keystore 직접(security-crypto deprecated) |
| 로그인 | 이메일·Google·카카오 | **+ Sign in with Apple 필수**(4.8) | 그대로 |
| 계정 삭제 | 설정에서 | 앱 안 삭제(있음) + Apple 토큰 폐기 | 앱 안 삭제(있음) + **웹 삭제 페이지 필수** |
| UGC 요구 | — | 필터·**신고·차단**·공개 연락처 | 약관 동의·**신고·차단**·조치. CSAE는 "사진" 카테고리로 범위 밖 |
| 결제 | **없음** — 앱 설치 안내 | IAP (유일한 결제, 앱에서 구독하면 웹도 열림) | Google Play 결제. 한국 Billing Choice 2026-12-31 |
| 자동 백업 | 탭 열려 있을 때 | 앱 열 때·충전 중 유휴. 꺼진 상태 즉시 업로드 불가 | WorkManager + 제약(Wi-Fi·배터리). FGS 선언 회피 |
| 선언·심사 문서 | 없음 | Privacy Manifest, 영양 라벨, 연령 등급 설문(13+ 예상) | Data safety, 사진 권한 선언 폼, targetSdk 36 |
| 화면 캡처 | 불가 | 사후 통지만 | `FLAG_SECURE` 가능하나 안 씀 |

**두 스토어 공통으로 앱 출시 전에 필요한 것(지금 없음):** 사진 **신고** 기능과 멤버 **차단**, 공개 연락처(지원 이메일), 업로드 전 약관 동의, 개인정보처리방침(developer-guide 14단계). 여기에 iOS는 Sign in with Apple과 IAP, Android는 웹 계정 삭제 페이지가 더해집니다.
