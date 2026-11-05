// 미리 렌더한 프레임 — 같은 장면을 헤드리스 브라우저로 열어 진행도 0~1을 N장 찍고 한 장(스프라이트)으로 묶는다.
// 설계: docs/guides/3d-hero.md "⑤ 사이트 연결 1차". 결과는 hero-src/out/(커밋 안 함). --publish면 public/hero/로 복사.
// 사용: pnpm hero:frames [--model=/hero-src/out/head.min.glb] [--frames=48] [--cols=160] [--aspect=1.7778] [--publish]
// Chromium 경로가 따로 있으면 HERO_CHROMIUM=/path/to/chromium
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { serve, ROOT } from './serve.mjs';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const frames = Number(arg('frames', 48));
const cols = Number(arg('cols', 104));
const aspect = Number(arg('aspect', 16 / 9));
const model = arg('model', '');
const out = join(ROOT, 'hero-src/out');
mkdirSync(join(out, 'frames'), { recursive: true });

const server = await serve(4322);
const browser = await chromium.launch({ executablePath: process.env.HERO_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
const qs = new URLSearchParams({ cols, aspect, preserve: '1', ...(model ? { model } : {}) });
await page.goto(`http://localhost:4322/scripts/hero/scene.html?${qs}`);
await page.waitForFunction(() => window.heroReady || window.heroError, null, { timeout: 60000 });
const err = await page.evaluate(() => window.heroError);
if (err) throw new Error(err);

const tiles = [];
for (let i = 0; i < frames; i++) {
  const p = frames === 1 ? 1 : i / (frames - 1);
  const shot = await page.evaluate((p) => { window.hero.setProgress(p); return window.hero.snapshot(); }, p);
  // readPixels는 아래에서 위로 — 뒤집어서 저장
  const png = await sharp(Buffer.from(shot.data), { raw: { width: shot.width, height: shot.height, channels: 4 } }).flip().png().toBuffer();
  writeFileSync(join(out, 'frames', `${String(i).padStart(3, '0')}.png`), png);
  tiles.push({ png, w: shot.width, h: shot.height });
}
await browser.close();
server.close();

// 스프라이트: 세로로 쌓는다(프레임 i = y * i). 무손실 WebP — 픽셀 그림이라 손실 압축을 쓰지 않는다
const { w, h } = tiles[0];
const sprite = sharp({ create: { width: w, height: h * frames, channels: 4, background: '#000000' } })
  .composite(tiles.map((t, i) => ({ input: t.png, top: i * h, left: 0 })));
await sprite.webp({ lossless: true }).toFile(join(out, 'hero-sprite.webp'));
const meta = { frames, width: w, height: h, aspect, cols, model: model || null, createdAt: new Date().toISOString() };
writeFileSync(join(out, 'hero-sprite.json'), JSON.stringify(meta, null, 2));
console.log(`→ ${frames} frames ${w}×${h}, ${join(out, 'hero-sprite.webp')}`);

if (process.argv.includes('--publish')) {
  mkdirSync(join(ROOT, 'public/hero'), { recursive: true });
  copyFileSync(join(out, 'hero-sprite.webp'), join(ROOT, 'public/hero/hero-sprite.webp'));
  copyFileSync(join(out, 'hero-sprite.json'), join(ROOT, 'public/hero/hero-sprite.json'));
  console.log('→ public/hero/ 에 복사(커밋 대상)');
}
