---
title: Forest
summary: 파도 · 비 · 바람 · 모래 · 장작 다섯 가지 자연 소리를 원하는 비율로 섞어 나만의 소리를 만드는 명상 앱.
short: 자연 소리 다섯 가지를 섞는 명상 앱
metric: { value: 5, label: 트랙 동시 믹싱 }
period: 2026.09 ~
stack: [SwiftUI, Jetpack Compose, AVAudioEngine, Cloudflare Workers, Hono, D1, R2]
order: 2
---

## 무엇

다섯 가지 자연 소리를 원하는 비율로 섞어 나만의 소리를 만드는 집중 · 명상 앱이다.

## 접근

- handoff-agent로 iOS · Android 네이티브 동시 개발 — SwiftUI · Jetpack Compose, 같은 화면·컴포넌트 구성
- Cloudflare Workers + Hono · D1 · R2 백엔드 — 서버 관리 부담 없이, 이 규모에서 비용 거의 0
- AVAudioEngine 기반 5트랙 동시 믹싱 플레이어 — 레이어별 볼륨 · 프리셋 · 수면 타이머

## 결과

개발 중이다.
