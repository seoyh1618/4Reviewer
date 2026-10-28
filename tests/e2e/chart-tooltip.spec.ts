import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../shared/domain.mjs";

const thisMonth = today().slice(0, 7);
const previous = new Date(`${thisMonth}-01T12:00:00Z`);
previous.setUTCMonth(previous.getUTCMonth() - 1);
const previousMonth = previous.toISOString().slice(0, 7);
const monthLabel = (key: string) => `${key.replace("-", "년 ")}월`;
const chart = (page: Page) =>
  page.getByRole("group", { name: "월별 구매금액과 입금액", exact: true });
const tooltip = (page: Page) => page.getByRole("tooltip");

async function seed(page: Page, empty = false) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `chart-${randomUUID()}@example.test`,
          password: "ReviewPass-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  if (!empty) {
    for (const row of [
      {
        name: "이전 달 구매",
        price: 45000,
        expectedPayback: 45000,
        additionalReviewFee: 5000,
        purchaseDate: `${previousMonth}-10`,
        receivedAmount: 50000,
      },
      {
        name: "이번 달 구매",
        price: 27900,
        expectedPayback: 27900,
        purchaseDate: today(),
        receivedAmount: 7900,
      },
    ]) {
      expect(
        (
          await page.request.post("/api/reviews", {
            data: {
              platform: "쿠팡",
              shippingMethod: "빈박스",
              reviewType: "사진 리뷰",
              reviewStatus: "done",
              reviewedAt: today(),
              paidAt: today(),
              ...row,
            },
          })
        ).status(),
      ).toBe(201);
    }
  }
  await page.goto("/");
}

test("monthly chart: mouse, keyboard, zero values, exact amounts and live refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seed(page);
  const months = chart(page).getByRole("button");
  await expect(months).toHaveCount(6);
  await expect(tooltip(page)).toHaveCount(0);
  await months.first().hover();
  await expect(tooltip(page).locator("dd")).toHaveText(["0원", "0원"]);
  await months.nth(4).hover();
  await expect(tooltip(page)).toContainText(monthLabel(previousMonth));
  await expect(tooltip(page).locator("dd")).toHaveText(["45,000원", "0원"]);
  await months.last().locator(".chart-bar.received").hover();
  await expect(tooltip(page)).toContainText(monthLabel(thisMonth));
  await expect(tooltip(page).locator("dd")).toHaveText([
    "27,900원",
    "57,900원",
  ]);
  await page.screenshot({
    path: "docs/screenshots/chart-tooltip-desktop.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("heading", { name: "리뷰 대시보드" }).hover();
  await expect(tooltip(page)).toHaveCount(0);
  await months.first().focus();
  await expect(tooltip(page).locator("dd")).toHaveText(["0원", "0원"]);
  await page.keyboard.press("Tab");
  await expect(months.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(months.nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await expect(months.nth(2)).toBeFocused();
  await expect(months.nth(2)).toHaveAttribute(
    "aria-describedby",
    (await tooltip(page).getAttribute("id")) as string,
  );
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
  await expect(months.nth(2)).toBeFocused();
  await months.last().click();
  await page.getByRole("heading", { name: "리뷰 대시보드" }).hover();
  await expect(tooltip(page)).toBeVisible();
  await months.last().click();
  await expect(tooltip(page)).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  // Keep the same selection open while the existing refresh path supplies new data.
  await chart(page).getByRole("button").last().click();
  const updated = await page.request.post("/api/reviews", {
    data: {
      name: "갱신 후 구매",
      platform: "쿠팡",
      shippingMethod: "실배송",
      price: 1000,
      expectedPayback: 0,
      purchaseDate: today(),
      reviewType: "사진 리뷰",
      reviewStatus: "todo",
    },
  });
  expect(updated.status()).toBe(201);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(tooltip(page).locator("dd")).toHaveText([
    "28,900원",
    "57,900원",
  ]);
});

test.describe("touch chart", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("monthly chart: tap selection, dismissal, edge months and mobile layouts", async ({
    page,
  }) => {
    await seed(page);
    for (const viewport of [
      { width: 360, height: 844 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const months = chart(page).getByRole("button");
      await expect(page.locator(".sync-status")).toContainText("마지막 동기화");
      await chart(page).scrollIntoViewIfNeeded();
      for (const index of [0, 4, 5]) {
        const month = months.nth(index);
        const bounds = (await month.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        await month.tap({
          position: { x: bounds.width / 2, y: bounds.height - 12 },
        });
        await expect(month).toHaveAttribute("aria-pressed", "true");
        await expect(tooltip(page)).toBeVisible();
        await expect(tooltip(page).locator("dd")).toHaveText(
          index === 0
            ? ["0원", "0원"]
            : index === 4
              ? ["45,000원", "0원"]
              : ["27,900원", "57,900원"],
        );
        const tip = (await tooltip(page).boundingBox())!;
        expect(tip.x).toBeGreaterThanOrEqual(0);
        expect(tip.x + tip.width).toBeLessThanOrEqual(viewport.width);
        await expect(tooltip(page)).toBeInViewport();
      }
      if (viewport.width === 390) {
        await page.screenshot({
          path: "docs/screenshots/chart-tooltip-mobile.png",
          fullPage: false,
          animations: "disabled",
        });
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
      await months.last().tap();
      await expect(tooltip(page)).toHaveCount(0);
      await months.first().tap();
      await expect(tooltip(page)).toBeVisible();
      await page.locator(".chart-hint").tap();
      await expect(tooltip(page)).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
  test("monthly chart: empty and large values remain readable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await seed(page, true);
    await chart(page).getByRole("button").last().tap();
    await expect(tooltip(page).locator("dd")).toHaveText(["0원", "0원"]);
    expect(
      (
        await page.request.post("/api/reviews", {
          data: {
            name: "큰 금액 확인",
            platform: "쿠팡",
            shippingMethod: "빈박스",
            price: 1000000000,
            expectedPayback: 1000000000,
            receivedAmount: 1000000000,
            purchaseDate: today(),
            paidAt: today(),
            reviewType: "사진 리뷰",
            reviewStatus: "done",
            reviewedAt: today(),
          },
        })
      ).status(),
    ).toBe(201);
    await page.reload();
    await chart(page).getByRole("button").last().tap();
    await expect(tooltip(page).locator("dd")).toHaveText([
      "1,000,000,000원",
      "1,000,000,000원",
    ]);
    expect(
      await tooltip(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
