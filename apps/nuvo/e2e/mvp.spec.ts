import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PHOTOS } from "./fixtures";
import { newPageWithoutFolderPicker, outboxLink, signUp, waitUploadsDone } from "./helpers";

const photo = (n: string) => join(PHOTOS, n);
const JPGS = readdirSync(PHOTOS).filter((f) => f.endsWith(".jpg")).sort(); // 4장 (photo-1, 1-small, 2, 3)

test("랜딩: 셰이더 캔버스와 시작 버튼", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /흩어진 사진을/ })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인 없이 내 PC 사진 보기" })).toBeVisible();
});

test("테마: 밝게/어둡게 전환이 새로고침 후에도 유지", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "어둡게" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "밝게" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)"); // 순수 흰색 금지
});

test("로그인 없이 로컬 폴더 보기 (HEIC 포함, 사진 아닌 파일 무시)", async ({ browser }) => {
  const page = await newPageWithoutFolderPicker(browser);
  await page.goto("/library");
  await page.getByTestId("folder-input").first().setInputFiles(PHOTOS);
  await expect(page.getByTestId("folder-chip")).toContainText("6장", { timeout: 60_000 });
  await expect(page.getByTestId("photo")).toHaveCount(6);

  // HEIC 원본 보기 (WASM 디코딩)
  await page.getByRole("button", { name: "iphone.heic" }).click();
  const img = page.getByRole("dialog", { name: "사진 보기" }).getByRole("img", { name: "iphone.heic" });
  await expect(img).toBeVisible({ timeout: 30_000 });
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(1000);
  await page.keyboard.press("Escape");
  await page.context().close();
});

test("업로드 → 타임라인 → 중복 정리 → 로컬과 합치기", async ({ browser }) => {
  const page = await newPageWithoutFolderPicker(browser);
  await signUp(page, "엄마");

  await page.getByTestId("upload-input").setInputFiles(JPGS.map(photo));
  await waitUploadsDone(page, 4);
  await expect(page.getByTestId("photo")).toHaveCount(4);

  // 같은 파일 다시 올리면 건너뜀
  await page.getByTestId("upload-input").setInputFiles([photo("photo-2.jpg")]);
  await expect(page.getByTestId("upload-panel")).toContainText("업로드 완료 5장");
  await expect(page.getByTestId("photo")).toHaveCount(4);

  // 새로고침해도 서버에 남아 있다
  await page.reload();
  await expect(page.getByTestId("photo")).toHaveCount(4);

  // 사진 보기: 2048px 사본
  await page.getByTestId("photo").first().click();
  const viewer = page.getByRole("dialog", { name: "사진 보기" });
  await expect(viewer.locator("img").last()).toHaveJSProperty("complete", true);
  await page.keyboard.press("ArrowRight");
  await expect(viewer).toContainText("2 / 4");
  await page.keyboard.press("Escape");

  // 중복 정리: photo-1과 축소본이 한 그룹, 원본(큰 쪽)을 남긴다
  await page.getByRole("button", { name: "중복 정리" }).click();
  await expect(page.getByTestId("dup-group")).toHaveCount(1);
  await expect(page.getByTestId("dup-group").locator("figure").first()).toContainText("1600×1200");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /모두 정리/ }).click();
  await expect(page.getByText("중복된 사진이 없어요")).toBeVisible();

  // 이 PC 폴더 연결: 이미 nuvo에 있는 사진은 한 칸으로 합쳐진다
  await page.goto("/library");
  await expect(page.getByTestId("photo")).toHaveCount(3);
  await page.getByTestId("folder-input").first().setInputFiles(PHOTOS);
  await expect(page.getByTestId("folder-chip")).toContainText("6장", { timeout: 60_000 });
  // nuvo 3장(1,2,3) + PC에만 있는 3장(1-small, 4, heic) = 6칸
  await expect(page.getByTestId("photo")).toHaveCount(6);
  await expect(page.locator('[title="이 PC에만 있음 · 백업 안 됨"]')).toHaveCount(3);

  // 선택해서 백업
  await page.getByRole("radio", { name: "이 PC" }).click();
  await page.getByTestId("photo").first().click({ modifiers: ["Meta"] });
  await page.getByTestId("selection-bar").getByRole("button", { name: "전체" }).click();
  await page.getByTestId("selection-bar").getByRole("button", { name: /nuvo에 백업 3/ }).click();
  await waitUploadsDone(page, 3); // 페이지를 새로 열어 패널이 비워진 뒤라 이번 백업분만 센다
  await page.getByRole("radio", { name: "전체" }).click();
  await expect(page.locator('[title="이 PC에만 있음 · 백업 안 됨"]')).toHaveCount(0);

  // 3D 보기
  await page.getByRole("radio", { name: "3D" }).click();
  await expect(page.getByTestId("timeline-3d").locator("canvas")).toBeVisible();
  await page.context().close();
});

test("Space: 초대 → 함께 업로드 → 실시간 반영 → 권한", async ({ browser }) => {
  const mom = await newPageWithoutFolderPicker(browser);
  await signUp(mom, "엄마");
  await mom.goto("/spaces");
  await mom.getByRole("button", { name: "새 Space" }).click();
  await mom.getByLabel("이름").fill("우리 가족");
  await mom.getByRole("button", { name: "만들기" }).click();
  await expect(mom.getByTestId("space-name")).toHaveText("우리 가족");

  await mom.getByTestId("upload-input").setInputFiles([photo("photo-1.jpg")]);
  await waitUploadsDone(mom, 1);
  await expect(mom.getByTestId("photo")).toHaveCount(1);

  await mom.getByRole("button", { name: "초대" }).click();
  await mom.getByRole("button", { name: "초대 링크 만들기" }).click();
  const url = await mom.getByTestId("invite-url").inputValue();
  await mom.keyboard.press("Escape");

  const kid = await newPageWithoutFolderPicker(browser);
  await signUp(kid, "동생");
  await kid.goto(url);
  await expect(kid.getByTestId("invite-space")).toHaveText("우리 가족");
  await kid.getByRole("button", { name: "참여하기" }).click();
  await expect(kid.getByTestId("space-name")).toHaveText("우리 가족");

  // 동생이 올리면 엄마 화면에 새로고침 없이 나타난다
  await kid.getByTestId("upload-input").setInputFiles([photo("photo-3.jpg")]);
  await waitUploadsDone(kid, 1);
  await expect(mom.getByText("동생님이 사진 1장을 추가했어요").first()).toBeVisible();
  await expect(mom.getByTestId("photo")).toHaveCount(2);

  // 동생은 엄마 사진을 지울 수 없다 (선택해도 삭제 버튼이 없음)
  await kid.reload();
  await kid.getByRole("radio", { name: "엄마" }).click();
  await kid.getByTestId("photo").first().click({ modifiers: ["Meta"] });
  await expect(kid.getByTestId("selection-bar").getByRole("button", { name: "삭제" })).toHaveCount(0);

  // 멤버 목록
  await mom.getByRole("button", { name: "멤버", exact: true }).click();
  await expect(mom.getByTestId("members").locator("li")).toHaveCount(2);
  await mom.context().close();
  await kid.context().close();
});

test("이메일 가입 인증 → 비밀번호 재설정 → 새 비밀번호로 로그인", async ({ page, browser }) => {
  const email = await signUp(page, "재설정");

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/signin");
  await p.getByRole("button", { name: "비밀번호를 잊었어요" }).click();
  await p.getByLabel("이메일").fill(email);
  await p.getByRole("button", { name: "재설정 링크 받기" }).click();
  await expect(p.getByTestId("check-email")).toContainText("재설정 링크");

  await p.goto(await outboxLink(p, email, /reset-password/));
  await expect(p).toHaveURL(/\/reset-password\?token=/);
  await p.getByLabel("새 비밀번호").fill("newpassword5678");
  await p.getByLabel("한 번 더").fill("newpassword5678");
  await p.getByRole("button", { name: "비밀번호 바꾸기" }).click();
  await expect(p.getByText("비밀번호를 바꿨어요")).toBeVisible();

  await p.getByLabel("이메일").fill(email);
  await p.getByLabel("비밀번호").fill("password1234");
  await p.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(p.getByRole("alert")).toContainText("맞지 않아요");
  await p.getByLabel("비밀번호").fill("newpassword5678");
  await p.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(p).toHaveURL(/\/library/);

  // 비밀번호를 바꾸면 처음 기기의 로그인은 풀린다
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await ctx.close();
});
