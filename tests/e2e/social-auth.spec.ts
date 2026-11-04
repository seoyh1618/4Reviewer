import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const providers = [
  { id: "google", name: "Google" },
  { id: "kakao", name: "카카오" },
  { id: "naver", name: "네이버" },
];
test("mobile social login keeps full animated identity and all login controls reachable", async ({
  page,
}) => {
  await page.route("**/api/auth/social/providers", (route) =>
    route.fulfill({ json: { providers } }),
  );
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Google로 계속하기" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "카카오로 계속하기" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "네이버로 계속하기" }),
    ).toBeVisible();
    const orbit = await page.locator(".orbit").boundingBox();
    expect(orbit!.width).toBe(220);
    expect(orbit!.height).toBe(220);
    expect((await page.locator(".orbit-center").boundingBox())!.width).toBe(70);
    const size = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(size.width).toBeLessThanOrEqual(viewport.width);
    if (viewport.height >= 844 || viewport.width > 600)
      expect(size.height).toBeLessThanOrEqual(viewport.height + 1);
    await page
      .getByRole("button", { name: "회원가입", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "회원가입", exact: true }),
    ).toBeInViewport();
    if (viewport.width === 390)
      await page.screenshot({
        path: `test-results/social-login-${test.info().project.name}.png`,
        fullPage: true,
      });
  }
  await page.route("**/api/auth/social/google/start", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      intent: "login",
      remember: true,
    });
    await route.fulfill({
      status: 503,
      json: { error: "잠시 후 다시 시도해 주세요." },
    });
  });
  await page.getByRole("button", { name: "Google로 계속하기" }).click();
  await expect(page.getByRole("alert")).toContainText("잠시 후");
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeEnabled();
});

test("social signup asks only for ID, cancellation returns to normal login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/social/providers", (route) =>
    route.fulfill({ json: { providers } }),
  );
  await page.route("**/api/auth/social/pending", (route) =>
    route.fulfill({ json: { provider: "google" } }),
  );
  await page.route("**/api/auth/social/signup", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ username: "social_test" });
    await route.fulfill({
      status: 409,
      json: { error: "이미 사용 중인 아이디입니다." },
    });
  });
  await page.route("**/api/auth/social/cancel", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto("/?social=signup");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Google로 회원가입");
  await dialog.getByLabel("아이디", { exact: true }).fill("social_test");
  await expect(dialog.getByLabel("회원가입 코드")).toHaveCount(0);
  await dialog.getByRole("button", { name: "가입 완료" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "이미 사용 중인 아이디",
  );
  await expect(dialog.getByLabel("비밀번호", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
