---
title: handoff-agent
summary: Claude Design 핸드오프 패키지 1개로 iOS · Android · backend를 한 번에 만드는 Claude Code 플러그인.
short: 디자인 핸드오프 1개로 iOS·Android·backend를 한 번에
metric: { value: 39, unit: '%', label: '토큰 절감 · iOS·Android 각 8회' }
period: 2026.09 ~
stack: [Claude Code 플러그인, Python MCP 서버]
order: 1
images:
  - { src: ./handoff-agent/01-home.jpg, alt: "정합성 비교 — Forest 홈 화면 세 구현" }
  - { src: ./handoff-agent/02-onboarding.jpg, alt: "정합성 비교 — Forest 온보딩 화면 세 구현" }
  - { src: ./handoff-agent/03-sounds.jpg, alt: "정합성 비교 — Forest 사운드 목록 화면 세 구현" }
  - { src: ./handoff-agent/04-timer.jpg, alt: "정합성 비교 — Forest 재생 화면 타이머 드롭다운 세 구현" }
  - { src: ./handoff-agent/05-mix-sheet.jpg, alt: "정합성 비교 — Forest 믹스 볼륨 시트 세 구현" }
---

## 문제

iOS · Android를 따로 개발하며 비효율을 겪었다. 반복은 도구에 맡기고, 서비스를 좋게 만드는 데 집중하고 싶었다.

## 접근

파이프라인: 디자인 핸드오프 1개 → iOS · Android · backend 동시 구현.

- Claude Design 프로토타입 산출물을 레이아웃 트리(JSON) 구조로 정제
- 프론트 + 백엔드 인프라 인터뷰 결과로 스펙 문서화 — 요금 · 기능 · 예상 사용자 규모를 표로 선택지 제공
- 산출물을 바탕으로 각 플랫폼을 구현하는 빌더 에이전트 3개 — iOS · Android · backend 동시 생성
- 보고서 기반 정합성 검사 후 병합. 민감 정보(인증서·키)는 사용자가 직접 입력

## 결과

레이아웃 트리 정제로 구현 에이전트 토큰을 39% 줄였다(iOS · Android 각 8회 실측). 지금은 이 도구로 Forest를 만들고 있다.
