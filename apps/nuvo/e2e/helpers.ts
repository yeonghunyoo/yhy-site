import { expect, type Browser, type Page } from "@playwright/test";

export async function signUp(page: Page, name: string) {
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1e5)}@test.nuvo`;
  await page.goto("/signin");
  await page.getByRole("button", { name: "처음이신가요? 가입하기" }).click();
  await page.getByLabel("이름").fill(name);
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill("password1234");
  await page.getByRole("button", { name: "가입하기" }).click();
  // 인증 메일 안내 → 로컬 메일 보관함에서 링크를 꺼내 연다 (실제 사용자가 메일의 버튼을 누르는 것과 같음)
  await expect(page.getByTestId("check-email")).toBeVisible();
  const link = await outboxLink(page, email, /verify-email/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/library/);
  return email;
}

/** 로컬 개발 서버의 메일 보관함(/api/dev/outbox)에서 가장 최근 링크 */
export async function outboxLink(page: Page, email: string, pattern: RegExp) {
  for (let i = 0; i < 20; i++) {
    const res = await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`);
    const { mails } = (await res.json()) as { mails: { text: string }[] };
    const url = mails.filter((m) => pattern.test(m.text)).at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    if (url) return url;
    await page.waitForTimeout(250);
  }
  throw new Error(`메일이 오지 않았어요: ${email}`);
}

/** 폴더 참조 API를 숨겨 1회 스캔 경로(<input webkitdirectory>)를 쓰게 한다 — 자동화로 폴더 선택 창을 조작할 수 없어서 */
export async function newPageWithoutFolderPicker(browser: Browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    // @ts-expect-error 테스트용
    delete window.showDirectoryPicker;
  });
  return ctx.newPage();
}

export async function waitUploadsDone(page: Page, count: number) {
  await expect(page.getByTestId("upload-panel")).toContainText(`업로드 완료 ${count}장`, { timeout: 60_000 });
}
