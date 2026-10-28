import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("sign up with only an ID and log in on mobile without an email", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const username = `review_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  await page.goto("/");
  await expect(
    page.getByLabel("로그인 계정", { exact: true }),
  ).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await page
    .getByRole("button", { name: "아이디로 가입", exact: true })
    .click();
  await expect(page.getByLabel("이메일", { exact: true })).toHaveCount(0);
  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill("Username-test-1234");
  await page.getByLabel("회원가입 코드", { exact: true }).fill("3333");
  await expect(
    page.getByLabel("아이디", { exact: true }),
  ).toHaveAccessibleDescription(/4~30자/);
  await page.screenshot({
    path: test.info().outputPath("signup-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/auth/me")).json()).user.email,
  ).toBeNull();
  for (const identifier of [username.toUpperCase()]) {
    await page.request.post("/api/auth/logout", { data: {} });
    await page.reload();
    await page
      .getByLabel("로그인 계정", { exact: true })
      .fill(identifier);
    await page
      .getByLabel("비밀번호", { exact: true })
      .fill("Username-test-1234");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
    ).toBeVisible();
  }
});

test("existing email account can set an ID in account settings and keep it after reload", async ({
  page,
}) => {
  const username = `existing_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const password = "Existing-account-1234";
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `${username}@example.test`,
          password,
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "계정 설정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "내 계정", exact: true });
  await expect(dialog.getByLabel("로그인 아이디", { exact: true })).toHaveValue(
    "",
  );
  await dialog.getByLabel("로그인 아이디", { exact: true }).fill(username);
  await dialog.getByLabel("현재 비밀번호", { exact: true }).fill("incorrect");
  await dialog
    .getByRole("button", { name: "아이디 저장", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "현재 비밀번호가 일치하지 않습니다.",
  );
  await dialog.getByLabel("현재 비밀번호", { exact: true }).fill(password);
  await dialog
    .getByRole("button", { name: "아이디 저장", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("아이디를 저장했습니다.");
  await expect(dialog.getByLabel("현재 비밀번호", { exact: true })).toHaveValue(
    "",
  );
  await page.screenshot({
    path: test.info().outputPath("account-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await page.getByRole("button", { name: "계정 설정", exact: true }).click();
  await expect(dialog.getByLabel("로그인 아이디", { exact: true })).toHaveValue(
    username,
  );
  await dialog.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByLabel("로그인 계정", { exact: true }).fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
  ).toBeVisible();
});
