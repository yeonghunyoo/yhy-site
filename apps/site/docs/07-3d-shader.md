# 7단계 · 3D/셰이더 (옵션)

인트로 배경 하나에만 적용하고, 구조상 끼웠다 뺄 수 있게 아일랜드로 격리한다. 세계관 콘셉트가 정해진 뒤에 착수한다.

- 위치: 인트로 섹션 배경, `position: absolute; inset: 0; pointer-events: none`
- 스택: `three` + `@react-three/fiber`, `client:visible`로 동적 import — 초기 번들에 미포함
- 효과: 커스텀 `shaderMaterial` 노이즈 변형 평면 1개. uniform은 `uTime`, `uPointer`(마우스/터치), `uScroll`
- 폴백: 저사양·`prefers-reduced-motion`·WebGL 미지원 → 같은 색감의 CSS 그라디언트 애니메이션
- 성능 분기와 DPR 규칙은 [01-frontend.md](01-frontend.md)의 "반응형·모바일 UX"를 따른다
- 확장 여지: 프로젝트 썸네일 displacement 전환은 프로젝트가 3개 이상일 때 검토

## 정할 것

- 효과 종류·색감 — 세계관 콘셉트에 종속

## 완료 기준

- 효과 켜진 상태에서도 1단계 성능 예산(LCP 2.0s, INP 200ms)을 모바일 실기기에서 지킨다
- 저사양·reduced-motion에서 폴백이 보인다
