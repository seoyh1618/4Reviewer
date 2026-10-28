import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test("sidebar: icon navigation, keyboard toggle, persistence and mobile resize", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `sidebar-${randomUUID()}@example.test`,
      password: "SidebarPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  const sidebar = page.getByRole("complementary", {
    name: "워크스페이스 사이드바",
  });
  const navigation = sidebar.getByRole("navigation", { name: "메인 메뉴" });
  const toggle = page.locator(".sidebar-toggle");
  await expect(toggle).toHaveAccessibleName("사이드바 접기");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const expandedWidth = (await sidebar.boundingBox())!.width;
  const expandedContent = (await page.locator(".app-main").boundingBox())!
    .width;
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAccessibleName("사이드바 펼치기");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect((await sidebar.boundingBox())!.width).toBeLessThan(expandedWidth);
  expect(
    (await page.locator(".app-main").boundingBox())!.width,
  ).toBeGreaterThan(expandedContent);
  for (const label of [
    "대시보드",
    "내 리뷰",
    "리뷰 템플릿",
    "리뷰 캘린더",
    "페이백",
    "통계",
  ]) {
    const button = navigation.getByRole("button", { name: label, exact: true });
    await expect(button.locator("span")).toBeHidden();
    await expect(button).toHaveAttribute("title", label);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    await expect(page.locator("h1")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  }
  await sidebar.getByRole("button", { name: "계정 설정", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    sidebar.getByRole("button", { name: "계정 설정", exact: true }),
  ).toBeFocused();
  await sidebar
    .getByRole("button", { name: "주문내역 가져오기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await navigation
    .getByRole("button", { name: "대시보드", exact: true })
    .click();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/sidebar-collapsed.png",
    fullPage: true,
    animations: "disabled",
  });

  for (const width of [1024, 900, 821]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(toggle).toBeVisible();
    expect((await page.locator(".app-main").boundingBox())!.x).toBe(
      (await sidebar.boundingBox())!.width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  for (const width of [360, 390, 768, 820]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(sidebar).toBeHidden();
    await expect(toggle).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "모바일 메뉴" }),
    ).toBeVisible();
    expect((await page.locator(".app-main").boundingBox())!.x).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "내 리뷰", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "내 리뷰", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(navigation.getByText("내 리뷰", { exact: true })).toBeVisible();
  expect((await sidebar.boundingBox())!.width).toBe(expandedWidth);
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await navigation
    .getByRole("button", { name: "대시보드", exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/sidebar-expanded.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("sidebar remains operable when browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `sidebar-storage-${randomUUID()}@example.test`,
          password: "SidebarPass-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const toggle = page.locator(".sidebar-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});
