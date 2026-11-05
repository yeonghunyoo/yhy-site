// CSP 검사 (docs/media-security.md 5.2): 빌드된 SPA를 public/_headers의 CSP로 서빙하고,
// 랜딩·라이브러리·사진 처리 워커·HEIC(WASM) 디코딩에서 CSP 위반이 나는지 본다. API는 흉내만 낸다(로그인 없음).
//   pnpm nuvo build && node apps/nuvo/scripts/csp-check.mjs [사진 폴더]   (브라우저 버전이 안 맞으면 CHROMIUM_PATH=...)
// 사진 폴더 기본값은 E2E 픽스처(e2e/.fixtures/photos, iphone.heic 포함). HEIC 라이브러리를 올리면 꼭 다시 돌린다.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "@playwright/test";

const here = import.meta.dirname;
const dist = join(here, "..", "dist", "client");
const photos = process.argv[2] ?? join(here, "..", "e2e", ".fixtures", "photos");
const headers = readFileSync(join(dist, "_headers"), "utf8");
const csp = headers.match(/Content-Security-Policy: (.+)/)[1];
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(401, { "content-type": "application/json", "content-security-policy": csp });
    return res.end(JSON.stringify(url.pathname === "/api/config" ? { supportEmail: null } : url.pathname === "/api/auth-config" ? { google: false, kakao: false, password: true } : { error: "로그인이 필요해요" }));
  }
  let file = join(dist, url.pathname);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "content-security-policy": csp });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4319, r));

// 프로젝트의 Playwright와 설치된 브라우저 버전이 다르면 CHROMIUM_PATH로 실행 파일을 직접 준다
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  delete window.showDirectoryPicker;
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
});
const page = await ctx.newPage();
const consoleCsp = [];
page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && consoleCsp.push(m.text().slice(0, 200)));
const workerErrors = [];
page.on("worker", (w) => w.on("console", (m) => /Content Security Policy|Refused|EvalError/i.test(m.text()) && workerErrors.push(m.text().slice(0, 200))));
page.on("pageerror", (e) => consoleCsp.push(`pageerror: ${String(e).slice(0, 200)}`));

const report = {};
await page.goto("http://localhost:4319/");
await page.waitForTimeout(2500);
report.landing = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? null, violations: window.__csp }));

await page.goto("http://localhost:4319/library");
await page.getByTestId("folder-input").first().setInputFiles(photos);
await page.getByTestId("folder-chip").first().waitFor({ timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('[data-testid="photo"]').length >= 2, null, { timeout: 90000 }).catch(() => {});
report.photos = await page.locator('[data-testid="photo"]').count();
// HEIC 원본 보기 = WASM 디코딩
await page.getByRole("button", { name: "iphone.heic" }).click().catch((e) => (report.heicClick = String(e).slice(0, 120)));
const img = page.getByRole("dialog", { name: "사진 보기" }).getByRole("img", { name: "iphone.heic" });
report.heicWidth = await img.evaluate((el) => new Promise((r) => (el.complete && el.naturalWidth ? r(el.naturalWidth) : el.addEventListener("load", () => r(el.naturalWidth))))).catch((e) => String(e).slice(0, 120));
report.libraryViolations = await page.evaluate(() => window.__csp);
report.console = consoleCsp;
report.worker = workerErrors;
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
const bad = report.landing.violations.length + report.libraryViolations.length + report.console.length + report.worker.length;
const heicOk = typeof report.heicWidth === "number" && report.heicWidth > 0;
console.log(bad || !heicOk ? `\nCSP 검사 실패 (위반 ${bad}, HEIC ${heicOk ? "OK" : "실패"})` : "\nCSP 검사 통과");
process.exit(bad || !heicOk ? 1 : 0);
