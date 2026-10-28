import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test("signup code is required, rejects wrong codes, and is not needed for login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("회원가입 코드", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/signup-code-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const email = `signup-code-${randomUUID()}@example.test`;
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await expect(page.getByLabel("아이디", { exact: true })).toHaveCount(0);
  await page.getByLabel("비밀번호", { exact: true }).fill("SignupCode-1234");
  const code = page.getByLabel("회원가입 코드", { exact: true });
  await expect(code).toHaveAttribute("required", "");
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(code).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "SIGN UP", exact: true }),
  ).toBeVisible();

  await code.fill("1234");
  const denied = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/signup"),
  );
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  expect((await denied).status()).toBe(403);
  await expect(page.getByRole("alert")).toHaveText(
    "회원가입 코드가 올바르지 않습니다.",
  );
  expect(
    (await (await page.request.get("/api/auth/me")).json()).user,
  ).toBeNull();

  await code.fill("3333");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
  ).toBeVisible();

  await page.request.post("/api/auth/logout", { data: {} });
  await page.reload();
  await expect(page.getByLabel("회원가입 코드", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("로그인 계정", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill("SignupCode-1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
  ).toBeVisible();
});
