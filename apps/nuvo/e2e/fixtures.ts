import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(import.meta.dirname, ".fixtures");
export const PHOTOS = join(FIXTURES, "photos"); // 로컬 폴더 테스트용 (jpg 4 + 축소본 1 + heic 1)

/** 브라우저 캔버스로 서로 다른 그림의 JPEG를 만든다 (외부 이미지 없이) */
export default async function globalSetup() {
  if (existsSync(join(PHOTOS, "done"))) return;
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(join(PHOTOS, "sub"), { recursive: true });

  const browser = await chromium.launch();
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
  await browser.close();

  images.forEach((d, i) => {
    const file = join(i === 3 ? join(PHOTOS, "sub") : PHOTOS, `photo-${i + 1}.jpg`);
    writeFileSync(file, Buffer.from(d.split(",")[1]!, "base64"));
    // 촬영 시각 대신 파일 시각으로 날짜를 나눈다 (2026-10-01 ~ 10-04)
    const t = new Date(2026, 9, i + 1, 12).getTime() / 1000;
    utimesSync(file, t, t);
  });
  // 유사 중복: photo-1을 줄여서 다시 압축 (카톡 전송본 흉내)
  execFileSync("sips", ["-Z", "800", "-s", "formatOptions", "60", join(PHOTOS, "photo-1.jpg"), "--out", join(PHOTOS, "photo-1-small.jpg")], { stdio: "ignore" });
  // HEIC (아이폰 사진 형식)
  execFileSync("sips", ["-s", "format", "heic", join(PHOTOS, "photo-2.jpg"), "--out", join(PHOTOS, "sub", "iphone.heic")], { stdio: "ignore" });
  writeFileSync(join(PHOTOS, "notes.txt"), "사진이 아닌 파일은 무시되어야 한다");
  writeFileSync(join(PHOTOS, "done"), "");
}
