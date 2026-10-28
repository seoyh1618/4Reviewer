import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../shared/domain.mjs";
import { recentOrderMonths } from "../../shared/order-trend.mjs";

const current = today().slice(0, 7);
const previous = recentOrderMonths(current, 2)[0];
const chart = (page: Page) =>
  page.getByRole("region", { name: "주문금액 추이", exact: true });
async function seed(page: Page, empty = false) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `order-trend-${randomUUID()}@example.test`,
          password: "ReviewPass-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  if (!empty)
    for (const row of [
      {
        price: 45000,
        purchaseDate: `${previous}-12`,
        receivedAmount: 50000,
        additionalReviewFee: 5000,
      },
      { price: 10000, purchaseDate: `${current}-01` },
      { price: 17900, purchaseDate: `${current}-03` },
    ])
      expect(
        (
          await page.request.post("/api/reviews", {
            data: {
              name: "주문 추이 확인",
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
  await page.goto("/?view=insights");
}

test("order trend uses order prices, switches monthly/daily and preserves keyboard selection on refresh", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await seed(page);
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "72,900원",
  );
  await expect(chart(page).getByRole("slider")).toHaveCount(0);
  await expect(chart(page).locator(".order-trend-selection")).toHaveCount(0);
  await expect(page.locator(".metrics, .earnings-section")).toHaveCount(0);
  await expect(chart(page)).not.toContainText("실제 입금액");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: info.outputPath("orders-monthly-1440.png"),
    fullPage: true,
  });
  await chart(page).getByRole("button", { name: "일별", exact: true }).click();
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "27,900원",
  );
  await expect(chart(page).getByRole("img")).toHaveAccessibleName(
    /일별 주문금액 라인 차트/,
  );
  const plot = chart(page).getByRole("group", { name: "주문금액 차트 탐색" });
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(chart(page).locator(".order-trend-detail strong")).toHaveText(
    "10,000원 · 1건",
  );
  await page.keyboard.press("ArrowRight");
  await expect(chart(page).locator(".order-trend-detail strong")).toHaveText(
    "0원 · 0건",
  );
  await page.keyboard.press("ArrowRight");
  await expect(chart(page).locator(".order-trend-detail strong")).toHaveText(
    "17,900원 · 1건",
  );
  await chart(page)
    .getByRole("combobox", { name: "일별 주문 조회 월" })
    .selectOption(previous);
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "45,000원",
  );
  await chart(page).getByRole("combobox").selectOption(current);
  await plot.focus();
  await page.keyboard.press("Home");
  expect(
    (
      await page.request.post("/api/reviews", {
        data: {
          name: "추가 주문",
          platform: "쿠팡",
          shippingMethod: "실배송",
          reviewType: "사진 리뷰",
          reviewStatus: "todo",
          price: 1000,
          purchaseDate: `${current}-01`,
        },
      })
    ).status(),
  ).toBe(201);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(chart(page).locator(".order-trend-detail strong")).toHaveText(
    "11,000원 · 2건",
  );
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "28,900원",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .include(".order-trend")
        .include(".analysis-grid")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test.describe("touch order trend", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("day selection, zero data and large orders remain usable on mobile", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, true);
    await expect(chart(page).locator(".order-trend-empty")).toBeVisible();
    await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
      "0원",
    );
    await chart(page).getByRole("button", { name: "일별", exact: true }).tap();
    expect(
      (
        await page.request.post("/api/reviews", {
          data: {
            name: "큰 주문",
            platform: "쿠팡",
            shippingMethod: "실배송",
            reviewType: "사진 리뷰",
            reviewStatus: "todo",
            price: 1000000000,
            purchaseDate: `${current}-01`,
          },
        })
      ).status(),
    ).toBe(201);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(chart(page).locator(".order-trend-empty")).toHaveCount(0);
    await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
      "1,000,000,000원",
    );
    for (const width of [390, 360, 844]) {
      await page.setViewportSize({ width, height: 844 });
      const plot = chart(page).getByRole("img");
      await plot.tap({ position: { x: 48, y: 50 } });
      await expect(
        chart(page).locator(".order-trend-detail strong"),
      ).toHaveText("1,000,000,000원 · 1건");
      const box = (await plot.boundingBox())!;
      const days = new Date(
        Number(current.slice(0, 4)),
        Number(current.slice(5, 7)),
        0,
      ).getDate();
      const nextX = 48 + (box.width - 18 - 48) / (days - 1);
      await plot.tap({ position: { x: nextX, y: 50 } });
      await expect(
        chart(page).locator(".order-trend-detail strong"),
      ).toHaveText("0원 · 0건");
      for (const control of [
        chart(page).getByRole("button", { name: "일별", exact: true }),
        chart(page).getByRole("combobox"),
      ]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      }
      expect(
        await chart(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width === 390)
        await page.screenshot({
          path: info.outputPath("orders-daily-390.png"),
          fullPage: true,
        });
    }
  });
});
