// iOS 홈 화면 아이콘 — public/favicon.svg를 180×180 PNG(public/apple-touch-icon.png)로 찍는다(11/09, SEO 체크리스트).
// iOS가 모서리를 직접 둥글게 자르므로 둥근 모서리(rx)를 빼고 바탕을 꽉 채운다(투명하면 검게 나온다). 글자가 잘리지 않게 80%로 줄여 가운데에.
// 파비콘을 바꾸면 다시 돌린다.
// 사용: pnpm icon:apple   (Chromium 경로가 따로 있으면 HERO_CHROMIUM=/path/to/chromium)
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const svg = (await readFile(join(ROOT, 'public/favicon.svg'), 'utf8')).replace(/(<rect width="32" height="32") rx="[^"]*"/, '$1');
const browser = await chromium.launch({ executablePath: process.env.HERO_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
const bg = svg.match(/<rect width="32" height="32"[^>]*fill="([^"]+)"/)?.[1] ?? '#17191c';
await page.setContent(
  `<html><body style="margin:0;width:180px;height:180px;display:grid;place-items:center;background:${bg}">${svg.replace('<svg ', '<svg width="144" height="144" ')}</body></html>`,
);
const out = join(ROOT, 'public/apple-touch-icon.png');
await page.screenshot({ path: out, type: 'png', omitBackground: false });
console.log(`→ ${out}`);
await browser.close();
