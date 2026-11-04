import { test, expect } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const providers = [
  { id: "google", name: "Google" },
  { id: "kakao", name: "카카오" },
  { id: "naver", name: "네이버" },
];
test("review preview requests the configured provider without changing the normal login list", async ({
  page,
}) => {
  await page.route("**/api/auth/social/providers*", (route) => {
    const preview = new URL(route.request().url()).searchParams.get("preview");
    return route.fulfill({
      json: {
        providers:
          preview === "naver" ? [providers[0], providers[2]] : [providers[0]],
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "네이버로 계속하기" }),
  ).toHaveCount(0);
  await page.goto("/?social_preview=naver");
  await expect(
    page.getByRole("button", { name: "네이버로 계속하기" }),
  ).toBeVisible();
  await expect(page.locator(".social-divider")).toContainText("테스트");
});
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

test("mobile account withdrawal requires confirmation and password, then clears the session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const username = `withdraw_${Date.now()}`;
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: { username, password: "WithdrawTest123" },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "내 계정", exact: true }).click();
  const section = page.getByRole("region", { name: "회원 탈퇴", exact: true });
  await section.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  await expect(section).toContainText("복구할 수 없어요");
  await section.getByRole("button", { name: "취소", exact: true }).click();
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  await section.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  await section.getByLabel("현재 비밀번호").fill("wrong-password");
  await section.getByLabel("확인을 위해").fill("탈퇴");
  await section.getByRole("button", { name: "계정과 데이터 삭제" }).click();
  await expect(section.getByRole("alert")).toContainText("현재 비밀번호");
  await section.getByLabel("현재 비밀번호").fill("WithdrawTest123");
  expect(await section.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await section.getByRole("button", { name: "계정과 데이터 삭제" }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/auth/social/accounts")).status()).toBe(
    401,
  );
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: { email: username, password: "WithdrawTest123" },
      })
    ).status(),
  ).toBe(401);
});
