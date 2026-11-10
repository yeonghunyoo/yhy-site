// 브랜드 이미지 만들기 (docs/seo.md 2·3): 파비콘 SVG → PNG 아이콘, brand/og.html → OG 이미지.
//   node apps/nuvo/scripts/brand-assets.mjs   (설치 브라우저와 Playwright 버전이 다르면 CHROMIUM_PATH=...)
// 결과는 커밋한다: public/apple-touch-icon.png(180), public/icon-192.png, public/icon-512.png, src/assets/og.png(1200×630)
// OG는 빌드 자산(src/assets)이라 다시 찍으면 주소(해시)가 바뀌어 카카오·페이스북의 예전 미리보기 캐시를 피한다
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const svg = readFileSync(join(root, "public", "favicon.svg"), "utf8");
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

/** 아이콘: 모서리를 둥글리지 않은 꽉 찬 사각형(iOS·Android가 알아서 자른다). maskable 안전 영역(80%) 안에 글자가 들어가게 */
async function icon(size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const square = svg.replace('rx="14"', 'rx="0"').replace('d="M21 46V30a11 11 0 0 1 22 0v16"', 'd="M23 44V31a9 9 0 0 1 18 0v13"').replace('stroke-width="7"', 'stroke-width="6"');
  await page.setContent(`<html><body style="margin:0">${square.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, out), omitBackground: false });
  await page.close();
  console.log(`✓ ${out}`);
}

await icon(180, "public/apple-touch-icon.png");
await icon(192, "public/icon-192.png");
await icon(512, "public/icon-512.png");

const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.goto(pathToFileURL(join(root, "brand", "og.html")).href);
await og.evaluate(() => document.fonts.ready);
await og.screenshot({ path: join(root, "src", "assets", "og.png") });
console.log("✓ src/assets/og.png");
await browser.close();
