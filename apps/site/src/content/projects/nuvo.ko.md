---
title: nuvo
summary: 흩어진 사진을 한곳에 모아 보고, 가족·친구와 함께 쌓아가는 프라이빗 사진 서비스.
short: 흩어진 사진을 한곳에 모으는 프라이빗 사진 서비스
metric: { value: 2, label: '곳의 사진을 한 타임라인으로 · 이 PC + nuvo' }
period: 2026.11 ~
stack: [React, Vite, React Three Fiber, Cloudflare Workers, Hono, R2, Durable Objects, Hyperdrive, Postgres, Drizzle, Better Auth]
order: 3
---

[서비스 보기](https://nuvo.yeonghun-yoo.workers.dev) · [코드](https://github.com/yeonghunyoo/nuvo)

## 무엇

흩어진 사진을 한곳에 모아 보고, 가족·친구와 함께 쌓아가는 프라이빗 사진 서비스다.

## 접근

- 이 PC 폴더를 업로드 없이 바로 본다(로그인 없이도 사용). nuvo 저장소에 올린 사진과 합쳐 같은 사진은 한 칸으로 보이는 통합 타임라인
- Space: 초대 링크로 가족·친구와 함께 올리고, 역할 · 내보내기 · 소유권 이전, 실시간 피드(WebSocket)
- 사진 처리는 브라우저 Web Worker에서 — SHA-256 · EXIF · 썸네일 · 유사 중복 정리(dHash) · HEIC 디코딩
- Cloudflare Worker 1개(Hono API · R2 · Durable Object) + Hyperdrive → Postgres, Drizzle ORM
- 랜딩 셰이더와 3D 시간 터널(React Three Fiber), 다크 · 라이트 테마

## 결과

MVP를 배포했다. 외부 클라우드 연동, 모바일 백업 앱, 동영상은 다음 단계다.
