// 스캔 모델 최적화 — hero-src/head.glb → hero-src/out/head.min.glb (Meshopt 압축 + WebP 텍스처 1024px)
// 설계: docs/guides/3d-hero.md "③ 최적화". 사용: pnpm hero:optimize [입력.glb]
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './serve.mjs';

const input = process.argv[2] ?? join(ROOT, 'hero-src/head.glb');
const out = join(ROOT, 'hero-src/out/head.min.glb');
mkdirSync(join(ROOT, 'hero-src/out'), { recursive: true });
execFileSync('gltf-transform', ['optimize', input, out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify-ratio', '0.5'], { stdio: 'inherit' });
console.log(`→ ${out} (${Math.round(statSync(out).size / 1024)} KB, 목표 ~300KB)`);
