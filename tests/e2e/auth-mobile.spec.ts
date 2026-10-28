import { test, expect } from "@playwright/test";

test("phone login fits the viewport without hiding its controls or errors", async ({
  page,
}) => {
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: "이메일 또는 비밀번호가 올바르지 않습니다.",
      }),
    }),
  );
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const login = page.getByRole("button", { name: "Sign in", exact: true });
    await expect(login).toBeVisible();
    const assertFits = async () => {
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));
      expect(size.width, JSON.stringify(viewport)).toBeLessThanOrEqual(
        viewport.width,
      );
      expect(size.height, JSON.stringify(viewport)).toBeLessThanOrEqual(
        viewport.height + 1,
      );
      const card = await page.locator(".auth-card").boundingBox();
      expect(
        Math.abs(card!.x + card!.width / 2 - viewport.width / 2),
      ).toBeLessThanOrEqual(1);
      await expect(login).toBeInViewport();
      await expect(
        page.getByRole("button", { name: "회원가입", exact: true }),
      ).toBeInViewport();
    };
    await assertFits();
    if (viewport.width === 375) {
      await page.screenshot({
        path: "test-results/login-mobile.png",
        animations: "disabled",
      });
    }
    await page.getByLabel("로그인 계정", { exact: true }).fill("layout-test");
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("invalid-layout-test");
    await login.click();
    await expect(page.getByRole("alert")).toBeVisible();
    await assertFits();
  }
});

test("short viewport and enlarged text keep login fields reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto("/");
  await page.getByLabel("비밀번호", { exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeInViewport();
  await page.addStyleTag({ content: ".auth-card { zoom: 1.5; }" });
  const login = page.getByRole("button", { name: "Sign in", exact: true });
  await login.scrollIntoViewIfNeeded();
  await expect(login).toBeInViewport();
  await expect(page.getByLabel("로그인 계정", { exact: true })).toBeVisible();
});
