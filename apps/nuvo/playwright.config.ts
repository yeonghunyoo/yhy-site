import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./e2e/fixtures.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: {
          // WebGL(랜딩 셰이더·3D)은 소프트웨어 GPU(swiftshader)로 돌린다.
          // 2D 캔버스(워커의 썸네일 생성)는 GPU를 쓰지 않게 해서, 소프트웨어 GPU가 막힐 때 사진 처리 전체가 멈추지 않게 한다.
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-accelerated-2d-canvas"],
        } } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
