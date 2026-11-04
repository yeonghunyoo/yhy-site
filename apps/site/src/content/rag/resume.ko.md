---
title: 유영훈 이력서
source: { file: resume.ko.pdf, hash: 6d2a773d708f5296b660fa7245cbce238af30a4bc0144074e479e26a5dd7908a, parser: pdf-unpdf, pages: 3 }
---

<!-- page:1 -->

## 소개 — 유영훈, Software Engineer · iOS · Builder

iOS 네이티브 앱 개발을 주로 맡아왔지만, 특정 플랫폼이나 직무에 저를 가두지 않습니다. 일하다 반복되는 문제를 만나면 도구를 직접 만들어 해결합니다. 반복은 도구에 맡기고, 서비스를 좋게 만드는 데 집중합니다.

최근에는 iOS · Android를 따로 개발하며 겪은 비효율을 handoff-agent라는 플러그인으로 풀었고, 지금은 그 도구로 Forest라는 서비스를 만들고 있습니다.

총 경력은 4년 6개월(2026년 11월 기준)입니다.

## 일하는 원칙

원칙 1 — 귀찮음은 아이디어의 시작점. 반복되는 업무가 귀찮다고 느껴질 때, 저는 그 감각을 자동화 아이디어의 출발점으로 삼습니다. 사람의 뇌는 사실 멀티태스킹이 되지 않기 때문에, 반복 작업은 최대한 자동화로 덜어내려 합니다.

원칙 2 — 근거로 말합니다. 말보다 눈으로 보여주는 것이 오해를 줄입니다. API 통신 로그는 보기 좋게 포맷화해 전달하고, 화면 이슈는 이미지·영상으로, 디자인은 샘플 데이터로 미리 확인하며 대화합니다.

## 기술과 연락처

Skill: Swift, Kotlin (Compose), Dart, Flutter, TypeScript, Python, RxSwift, Fastlane

연락처: yeonghun.yoo@gmail.com · GitHub github.com/yeonghunyoo

## 만든 것: handoff-agent

도구를 만들고, 그 도구로 서비스를 만듭니다.

handoff-agent (Claude Code 플러그인 · 2026.09 ~)는 Claude Design 핸드오프 패키지 1개로 iOS · Android · backend를 한 번에 만드는 Claude Code 플러그인입니다. 파이프라인: 디자인 핸드오프 1개 → iOS · Android · backend 동시 구현.

- input: Claude Design 산출물 → refine: 레이아웃 트리 (JSON) → interview: 스펙 문서 · 선택지 표 → iOS · Android · backend → verify: 검사 리포트 · Merge
- Claude Design 프로토타입 산출물을 레이아웃 트리(JSON) 구조로 정제 — 구현 에이전트 토큰 39% 절감 (iOS · Android 각 8회 실측)
- 프론트 + 백엔드 인프라 인터뷰 결과를 토대로 스펙 문서화 프로세스 구축 — 요금 · 기능 · 예상 사용자 규모를 인터뷰 기반으로 표로 선택지 제공
- 위 산출물 기반으로 각 플랫폼을 구현하는 빌더 에이전트 3개 — iOS · Android · backend 동시 생성
- 인터뷰 기반 백엔드 인프라 결정구조 및 보고서 기반 정합성 체크 프로세스 — 민감 정보(인증서·키)는 사용자가 직접 입력

## 만든 것: Forest

Forest (사운드 믹싱 집중 & 명상 앱 · 2026.09 ~)는 파도 · 비 · 바람 · 모래 · 장작 다섯 가지 자연 소리를 원하는 비율로 섞어 나만의 소리를 만드는 명상 앱입니다. handoff-agent로 iOS · Android 네이티브 동시 개발 중입니다.

- handoff-agent를 활용한 iOS · Android 네이티브 동시 개발 — SwiftUI · Jetpack Compose, 같은 화면·컴포넌트 구성
- Cloudflare Workers + Hono · D1 · R2 백엔드 — 서버 관리 부담 없이, 이 규모에서 비용 거의 0
- AVAudioEngine 기반 5트랙 동시 믹싱 플레이어 — 레이어별 볼륨 · 프리셋 · 수면 타이머

<!-- page:2 -->

![Forest 온보딩 화면 — 숨 쉴 틈을 위한 소리](/media/2651e564d5141a3a4cf8f1441069f7a0.jpg)

![Forest 홈 화면 — 저장한 믹스 목록](/media/e05dbbb809bb2ca41d4ff44eb57521c2.jpg)

![Forest 소리 조절 화면 — 다섯 소리의 볼륨 슬라이더](/media/31899b5fae8eb962c71f12715f9ca1f2.jpg)

![Forest 재생 화면 — 저녁 물결 믹스 재생 중](/media/80877856fbc56a0ee61b9235b702ea0d.jpg)

<!-- 11/03 직접 추가: 원본 PDF에는 없다. 출처는 nuvo 레포의 README·docs/mvp.md -->

## 만든 것: nuvo

nuvo (프라이빗 사진 서비스 · 2026.11 ~)는 흩어진 사진을 한곳에 모아 보고, 가족·친구와 함께 쌓아가는 프라이빗 사진 서비스입니다. 서비스 https://nuvo.yeonghun-yoo.workers.dev · 코드 github.com/yeonghunyoo/yhy-site/tree/main/apps/nuvo

- 이 PC 폴더를 업로드 없이 바로 보기(로그인 없이도 사용) + nuvo 저장소 업로드 — 같은 사진은 한 칸으로 합친 통합 타임라인
- Space: 초대 링크로 가족·친구와 함께 올리기, 역할 · 내보내기 · 소유권 이전, 실시간 피드(WebSocket)
- 사진 처리는 브라우저 Web Worker에서 — SHA-256 · EXIF · 썸네일 · 유사 중복 정리(dHash) · HEIC 디코딩
- Cloudflare Worker 1개(Hono API · R2 · Durable Object) + Hyperdrive → Postgres, Drizzle ORM
- 랜딩 셰이더와 3D 시간 터널(React Three Fiber), 다크 · 라이트 테마

<!-- 11/03 직접 추가: 원본 PDF에는 없다. 상세는 나중에 채운다 -->

## 경력: 클러쉬(주) · 반도체사 파견, 2026.09 ~ 현재

프로젝트: 반도체사 사내 에이전트 및 RAG 파이프라인 구축

2026년 9월 14일부터 클러쉬(주) 소속으로 반도체사(고객사)에 파견되어 사내 에이전트와 RAG 파이프라인을 구축하고 있습니다.

- 맡은 업무: 챗 에이전트, RAG 데이터 파이프라인 고도화

## 경력: 트립에이드 (Tripaid) · iOS Native, 2025.10 ~ 2026.09

헬미닥 AI 채팅 건강상담 서비스(App Store) — iOS 네이티브 앱 개발 및 아키텍처/DX 고도화

iOS UI/UX 정비 및 플랫폼 간 서비스 동기화

- Android 대비 정체된 iOS 환경을 점검해 UI/UX 전반 개선
- 플랫폼 간 정합성 확보
- 디자인 컴포넌트화 · 토큰화로 뷰 유지보수성 향상

네트워크 공통 인터셉터 도입 및 토큰 자동화

- 응답 · 에러 처리를 인터셉터 계층으로 분리해 중복 제거
- 인증 토큰 주입 · 갱신 자동화
- 커스텀 로깅으로 디버깅 효율 개선

Claude Design을 활용한 디자인 소요 최소화

- 디자인 샘플로 팀 간 방향성 공유
- 디자인 · 번역 결과를 네이티브 리소스로 컨버트해 빠르게 전달

## 경력: 홀리츠 (holich), 2023.04 – 2025.02 · 1년 11개월

Let's Bee 필리핀 음식 배달 서비스 (2024.07 – 2025.01 · Flutter)

- 유저 · 파트너(점주) 앱 UI/UX 구현
- 번역 자동화 프로세스를 기능 개발에 통합

(구) Let's Bee 클락 지역 배달 서비스 (2023.06 – 2024.11 · iOS) — UI/UX 개선 및 기능 추가 5건

- 장바구니 동기화 이슈
- 탭 간 스크롤 위치 캐싱
- 비밀번호 찾기 기능 추가
- Apple 계정 삭제 대응 (토큰 revoke)
- SNS 가입 정보 통일

MyCONECT 호텔 비대면 서비스 플랫폼 (2023.04 – 2024.12 · iOS)

- 얼굴 · 신분증 인식 기반 본인확인
- 가로 스택 차트 형태의 시간별 예약 기능

## 경력: (주)알파이글루, 2020.11 – 2022.03 · 1년 5개월

사주기반 아이 이름 작명 서비스 · 네이티브 iOS 앱 유지보수

- UI/UX 개선 및 콘텐츠 추가 — '오늘의 띠별 운세', '타로 신년운세' 콘텐츠 추가
