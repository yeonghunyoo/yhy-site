# hero-src — 히어로 3D 원본 (커밋하지 않음)

이 폴더는 `.gitignore`로 막혀 있다(이 README만 커밋). 얼굴 스캔 원본은 공개 레포에 올리지 않는다.
흐름 전체: [docs/guides/3d-hero.md](../docs/guides/3d-hero.md)

| 파일 | 무엇 |
| --- | --- |
| `head.glb` | 스캔 원본(앱에서 GLB로 내보낸 것, Blender로 정리했으면 그 결과). 넥타이 메시 이름에 `tie`를 넣으면 강조색이 된다 |
| `out/head.min.glb` | `pnpm hero:optimize` 결과 |
| `out/frames/*.png`, `out/hero-sprite.webp` | `pnpm hero:frames` 결과. `--publish`일 때만 `public/hero/`로 복사돼 커밋된다 |

```bash
pnpm site hero:optimize
pnpm site hero:preview                       # http://localhost:4321/scripts/hero/scene.html?model=/hero-src/out/head.min.glb
pnpm site hero:frames --model=/hero-src/out/head.min.glb
```
