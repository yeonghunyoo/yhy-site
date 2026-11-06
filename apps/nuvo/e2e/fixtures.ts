import { chromium } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(import.meta.dirname, ".fixtures");
export const PHOTOS = join(FIXTURES, "photos"); // 로컬 폴더 테스트용 (jpg 4 + 축소본 1 + heic 1)

/** 브라우저 캔버스로 서로 다른 그림의 JPEG를 만든다 (외부 이미지 없이) */
export default async function globalSetup() {
  if (existsSync(join(PHOTOS, "done"))) return;
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(join(PHOTOS, "sub"), { recursive: true });

  // 설치된 브라우저와 Playwright 버전이 다르면 CHROMIUM_PATH (playwright.config.ts와 같음)
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const images: string[] = await page.evaluate(() => {
    const out: string[] = [];
    const palettes = [
      ["#d9a37e", "#5d7a8c", "#f2e6d8"],
      ["#7aa37a", "#2f3e46", "#cad2c5"],
      ["#e07a5f", "#3d405b", "#f4f1de"],
      ["#9a8c98", "#22223b", "#f2e9e4"],
    ];
    palettes.forEach((p, k) => {
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = 1200;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 1600, 1200);
      grad.addColorStop(0, p[0]!);
      grad.addColorStop(1, p[1]!);
      g.fillStyle = grad;
      g.fillRect(0, 0, 1600, 1200);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = p[(i + k) % 3]!;
        g.globalAlpha = 0.6;
        g.beginPath();
        g.arc(((i * 337 + k * 911) % 1600), ((i * 211 + k * 503) % 1200), 60 + ((i * 47 + k * 13) % 220), 0, Math.PI * 2);
        g.fill();
      }
      out.push(c.toDataURL("image/jpeg", 0.9));
    });
    return out;
  });
  // 유사 중복: photo-1을 줄여서 다시 압축 (카톡 전송본 흉내). 예전엔 macOS sips — 이제 캔버스라 OS와 상관없음
  const small: string = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 600;
    c.getContext("2d")!.drawImage(img, 0, 0, 800, 600);
    return c.toDataURL("image/jpeg", 0.6);
  }, images[0]!);
  await browser.close();

  images.forEach((d, i) => {
    const file = join(i === 3 ? join(PHOTOS, "sub") : PHOTOS, `photo-${i + 1}.jpg`);
    writeFileSync(file, Buffer.from(d.split(",")[1]!, "base64"));
    // 촬영 시각 대신 파일 시각으로 날짜를 나눈다 (2026-10-01 ~ 10-04)
    const t = new Date(2026, 9, i + 1, 12).getTime() / 1000;
    utimesSync(file, t, t);
  });
  writeFileSync(join(PHOTOS, "photo-1-small.jpg"), Buffer.from(small.split(",")[1]!, "base64"));
  // HEIC (아이폰 사진 형식): 브라우저로는 만들 수 없어서 레포에 둔 작은 파일을 쓴다 (1600×1200 — 보기 테스트가 폭 1000px 이상을 확인)
  copyFileSync(join(import.meta.dirname, "assets", "iphone.heic"), join(PHOTOS, "sub", "iphone.heic"));
  writeFileSync(join(PHOTOS, "notes.txt"), "사진이 아닌 파일은 무시되어야 한다");
  writeFileSync(join(PHOTOS, "done"), "");
}
