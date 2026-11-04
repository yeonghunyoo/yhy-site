# yhy-site

yhy가 만드는 Cloudflare Workers 앱 모노레포.

| 앱 | 설명 |
| --- | --- |
| [apps/site](apps/site/README.md) | 빌더·개발자 포트폴리오 (Astro, 한/영) |
| [apps/nuvo](apps/nuvo/README.md) | 가족·친구와 함께 쌓는 프라이빗 사진 서비스 |
| [packages/cf-kit](packages/cf-kit) | 두 앱이 같이 쓰는 서버 모듈 (메일·예산 상한·요청 방어·알림) |

구조와 규칙: [docs/monorepo.md](docs/monorepo.md)

```sh
pnpm install
pnpm build          # 모든 앱
pnpm check          # 타입 검사
pnpm test           # 단위 테스트
pnpm site dev       # 포트폴리오 개발 서버
pnpm nuvo dev       # nuvo 개발 서버
```
