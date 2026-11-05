// 공유 미리보기 이미지(OG) — scripts/hero/og.html을 헤드리스로 1200×630 찍어 public/og.png로.
// 히어로와 같은 장면(scene.js)·사이트 글꼴을 쓴다. 모델을 바꾸면 다시 돌린다. 사용: pnpm hero:og
// Chromium 경로가 따로 있으면 HERO_CHROMIUM=/path/to/chromium
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serve, ROOT } from './serve.mjs';

const server = await serve(4323);
const browser = await chromium.launch({ executablePath: process.env.HERO_CHROMIUM || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://localhost:4323/scripts/hero/og.html');
await page.waitForFunction(() => window.ogReady, null, { timeout: 60000 });
await page.waitForTimeout(300);
const out = join(ROOT, 'public/og.png');
await page.screenshot({ path: out, type: 'png' });
console.log(`→ ${out}`);
await browser.close();
server.close();
