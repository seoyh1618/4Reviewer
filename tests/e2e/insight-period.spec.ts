import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const chart = (page: Page) =>
  page.getByRole("region", { name: "주문금액 추이", exact: true });
const income = (page: Page) =>
  page.getByRole("region", { name: "수익 구성", exact: true });
const year = (page: Page) => page.getByRole("combobox", { name: "통계 연도" });
const month = (page: Page) => page.getByRole("combobox", { name: "통계 월" });
const detail = (page: Page) =>
  page.getByRole("region", { name: "월별 상세 내역", exact: true });
const received = (page: Page) =>
  income(page)
    .locator(".analysis-income-context > div")
    .filter({ has: page.locator("dt", { hasText: "정산 금액" }) })
    .locator("dd");
async function seed(page: Page, empty = false) {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `period-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  if (!empty) {
    for (const item of [
      {
        name: "전년 구매 분할 입금",
        platform: "쿠팡",
        price: 40000,
        additionalReviewFee: 5000,
        purchaseDate: "2024-12-15",
        receivedAmount: 10000,
        paidAt: "2025-01-03",
        reviewStatus: "done",
      },
      {
        name: "1월 리뷰",
        platform: "네이버",
        price: 30000,
        additionalReviewFee: 2000,
        purchaseDate: "2025-01-10",
        reviewStatus: "done",
      },
      {
        name: "2월 작성 전",
        platform: "쿠팡",
        price: 10000,
        purchaseDate: "2025-02-10",
        reviewStatus: "todo",
      },
      {
        name: "다음 해 입금",
        platform: "11번가",
        price: 20000,
        additionalReviewFee: 3000,
        purchaseDate: "2026-12-20",
        receivedAmount: 23000,
        paidAt: "2027-01-05",
        reviewStatus: "done",
      },
    ]) {
      const response = await page.request.post("/api/reviews", {
        data: {
          shippingMethod: "빈박스",
          reviewType: "사진 리뷰",
          ...item,
        },
      });
      expect(response.status()).toBe(201);
      if (item.name === "전년 구매 분할 입금") {
        const saved = (await response.json()).review;
        const update = await page.request.put(`/api/reviews/${saved.id}`, {
          data: {
            ...saved,
            receivedAmount: 45000,
            paidAt: "2025-02-04",
          },
        });
        expect(update.status()).toBe(200);
      }
    }
  }
  await page.goto("/?view=insights");
  await expect(
    page.getByRole("heading", { name: "나의 리뷰 통계" }),
  ).toBeVisible();
}

test("statistics charts filter by year/month and preserve cross-period income, history and export", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await seed(page);
  await expect(page.locator(".metrics, .earnings-section")).toHaveCount(0);
  await expect(page.locator(".analysis-grid > section")).toHaveCount(5);
  await expect(received(page)).toHaveText("68,000원");
  await expect(
    income(page).locator(".analysis-income-total strong"),
  ).toHaveText("8,000원");
  await expect(year(page).getByRole("option", { name: "2027년" })).toHaveCount(
    1,
  );
  await year(page).selectOption("2025");
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "40,000원",
  );
  await expect(received(page)).toHaveText("45,000원");
  await expect(
    income(page).locator(".analysis-income-total strong"),
  ).toHaveText("5,000원");
  await expect(page.locator(".analysis-donut-center strong")).toHaveText("50%");
  await expect(page.locator(".analysis-donut-legend li")).toHaveText([
    "작성 전1건 50%",
    "리뷰 완료1건 50%",
    "정산 완료0건 0%",
  ]);
  await page.getByRole("button", { name: "주문건수", exact: true }).click();
  await expect(
    page.locator(".analysis-platform-bars .analysis-bar-label strong"),
  ).toHaveText(["1건", "1건"]);
  await page.screenshot({
    path: info.outputPath("statistics-year-1440.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.locator(".analysis-detail summary").click();
  await expect(detail(page).locator("tbody tr")).toHaveCount(12);
  await month(page).selectOption("01");
  await expect(
    chart(page).getByRole("button", { name: "일별", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "30,000원",
  );
  await expect(received(page)).toHaveText("10,000원");
  await expect(
    income(page).locator(".analysis-income-total strong"),
  ).toHaveText("0원");
  await expect(detail(page).locator("tbody tr")).toHaveText([
    "2025년 01월1건1건30,000원10,000원0원0원0원",
  ]);
  await page.reload();
  await expect(year(page)).toHaveValue("2025");
  await expect(month(page)).toHaveValue("01");
  await month(page).selectOption("02");
  await expect(received(page)).toHaveText("35,000원");
  await expect(
    income(page).locator(".analysis-income-total strong"),
  ).toHaveText("5,000원");
  await page.goBack();
  await expect(month(page)).toHaveValue("01");
  await page.goForward();
  await expect(month(page)).toHaveValue("02");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 데이터 내보내기" }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  for (const name of [
    "전년 구매 분할 입금",
    "1월 리뷰",
    "2월 작성 전",
    "다음 해 입금",
  ])
    expect(csv).toContain(name);
  await month(page).selectOption("03");
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "0원",
  );
  await expect(received(page)).toHaveText("0원");
  await expect(
    page.getByText("선택한 기간에 구매한 상품이 없어요"),
  ).toBeVisible();
  await year(page).selectOption("2027");
  await month(page).selectOption("01");
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "0원",
  );
  await expect(received(page)).toHaveText("23,000원");
  await expect(
    income(page).locator(".analysis-income-total strong"),
  ).toHaveText("3,000원");
  await page.locator(".analysis-detail summary").click();
  await expect(detail(page).locator("tbody tr")).toHaveText([
    "2027년 01월0건0건0원23,000원3,000원0원3,000원",
  ]);
  await year(page).selectOption("");
  await expect(month(page)).toBeDisabled();
  await expect(page).not.toHaveURL(/statsYear|statsMonth/);
});

test.describe("mobile statistics charts", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("charts and all filters remain readable and accessible on mobile", async ({
    page,
  }, info) => {
    await seed(page);
    await year(page).selectOption("2025");
    await month(page).selectOption("01");
    for (const width of [360, 390, 768, 844]) {
      await page.setViewportSize({ width, height: 844 });
      for (const control of [
        year(page),
        month(page),
        chart(page).getByRole("button", { name: "일별", exact: true }),
      ])
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      await expect(
        chart(page).locator(".order-trend-summary strong"),
      ).toHaveText("30,000원");
      await chart(page)
        .getByRole("group", { name: "주문금액 차트 탐색" })
        .focus();
      await page.keyboard.press("Home");
      await expect(
        chart(page).locator(".order-trend-detail strong"),
      ).toHaveText("0원 · 0건");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: info.outputPath("statistics-mobile-390.png"),
          fullPage: true,
        });
      }
    }
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
  });
});

test("empty statistics and invalid URLs remain safe, including single-month charts", async ({
  page,
}) => {
  await seed(page, true);
  await page.goto("/?view=insights&statsYear=invalid&statsMonth=99");
  await expect(year(page)).toHaveValue("");
  await expect(month(page)).toBeDisabled();
  await expect(page).not.toHaveURL(/statsYear|statsMonth/);
  await page.goto("/?view=insights&statsYear=2025&statsMonth=13");
  await expect(year(page)).toHaveValue("2025");
  await expect(month(page)).toHaveValue("");
  await expect(page).not.toHaveURL(/statsMonth/);
  await month(page).selectOption("02");
  await expect(chart(page).getByRole("slider")).toHaveCount(0);
  await chart(page).getByRole("button", { name: "월별", exact: true }).click();
  await chart(page).getByRole("group", { name: "주문금액 차트 탐색" }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(chart(page).locator(".order-trend-detail strong")).toHaveText(
    "0원 · 0건",
  );
  expect(
    await chart(page).getByRole("img").getAttribute("viewBox"),
  ).not.toContain("NaN");
  await expect(chart(page).getByRole("img")).not.toContainText("NaN");
  await expect(
    income(page).locator(".analysis-income-total strong"),
  ).toHaveText("0원");
  await expect(page.locator(".analysis-donut-center strong")).toHaveText("0%");
  const activity = page.getByRole("region", { name: "리뷰 활동", exact: true });
  await expect(activity.locator(".order-trend-summary strong")).toHaveText(
    "0건",
  );
  await expect(
    activity.getByText("이 기간에 작성한 리뷰가 없어요"),
  ).toBeVisible();
  await activity.getByRole("button", { name: "월별", exact: true }).click();
  await activity.getByRole("group", { name: "리뷰 활동 차트 탐색" }).focus();
  await page.keyboard.press("Home");
  await expect(activity.locator(".review-activity-detail strong")).toHaveText(
    "리뷰 0건",
  );
});

async function seedReviewActivity(page: Page) {
  await seed(page, true);
  let pending;
  for (const row of [
    { shippingMethod: "실배송", reviewedAt: "2025-01-03" },
    { shippingMethod: "빈박스", reviewedAt: "2025-01-03" },
    { shippingMethod: "실배송", reviewedAt: "2025-02-07" },
    { shippingMethod: "실배송", reviewedAt: "2025-02-08" },
    { shippingMethod: "빈박스", reviewedAt: "" },
    { shippingMethod: "빈박스", reviewedAt: "", reviewStatus: "todo" },
  ]) {
    const response = await page.request.post("/api/reviews", {
      data: {
        name: "이전 주문 리뷰 활동",
        platform: "쿠팡",
        price: 10000,
        purchaseDate: "2024-12-01",
        reviewStatus: "done",
        reviewType: "사진 리뷰",
        ...row,
      },
    });
    expect(response.status()).toBe(201);
    if (row.reviewStatus === "todo") pending = (await response.json()).review;
  }
  await page.goto("/?view=insights&statsYear=2025");
  return pending;
}

test("review activity counts completion dates and delivery types with monthly/daily filters and live updates", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const pending = await seedReviewActivity(page);
  const activity = page.getByRole("region", { name: "리뷰 활동", exact: true });
  await expect(chart(page).locator(".order-trend-summary strong")).toHaveText(
    "0원",
  );
  await expect(activity.locator(".order-trend-summary strong")).toHaveText(
    "4건",
  );
  await expect(activity.locator(".review-activity-legend li")).toHaveText([
    "실배송 3건",
    "빈박스 1건",
  ]);
  await expect(activity.locator(".review-activity-note")).toContainText(
    "작성일이 없는 1건",
  );
  await expect(activity.getByRole("img")).toHaveAccessibleName(
    /월별 리뷰 활동 막대 차트/,
  );
  const plot = activity.getByRole("group", { name: "리뷰 활동 차트 탐색" });
  await plot.focus();
  await page.keyboard.press("Home");
  await expect(activity.locator(".review-activity-detail")).toHaveText(
    "2025년 1월리뷰 2건실배송 1건빈박스 1건",
  );
  await page.keyboard.press("ArrowRight");
  await expect(activity.locator(".review-activity-detail")).toHaveText(
    "2025년 2월리뷰 2건실배송 2건빈박스 0건",
  );
  await page.keyboard.press("Escape");
  await expect(activity.locator(".review-activity-detail")).toHaveCount(0);
  await year(page).focus();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath("review-activity-desktop.png"),
    fullPage: true,
  });
  await month(page).selectOption("01");
  await expect(
    activity.getByRole("button", { name: "일별", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(activity.locator(".order-trend-summary strong")).toHaveText(
    "2건",
  );
  await plot.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(activity.locator(".review-activity-detail")).toHaveText(
    "1월 3일리뷰 2건실배송 1건빈박스 1건",
  );
  expect(
    (
      await page.request.put(`/api/reviews/${pending.id}`, {
        data: {
          ...pending,
          reviewStatus: "done",
          reviewedAt: "2025-01-03",
        },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(activity.locator(".order-trend-summary strong")).toHaveText(
    "3건",
  );
  await expect(activity.locator(".review-activity-detail")).toHaveText(
    "1월 3일리뷰 3건실배송 1건빈박스 2건",
  );
  await page.reload();
  await expect(activity.locator(".order-trend-summary strong")).toHaveText(
    "3건",
  );
  await expect(activity.getByRole("slider")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});

test.describe("touch review activity", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("activity chart supports tap details on mobile without a slider", async ({
    page,
  }, info) => {
    await seedReviewActivity(page);
    const activity = page.getByRole("region", {
      name: "리뷰 활동",
      exact: true,
    });
    await month(page).selectOption("01");
    for (const width of [390, 360, 844]) {
      await page.setViewportSize({ width, height: 844 });
      const svg = activity.getByRole("img");
      await svg.scrollIntoViewIfNeeded();
      await expect(async () => {
        const box = (await svg.boundingBox())!;
        const view = (await svg.getAttribute("viewBox"))!
          .split(" ")
          .map(Number);
        expect(view[2]).toBeCloseTo(box.width, 0);
      }).toPass();
      const box = (await svg.boundingBox())!;
      await svg.tap({
        position: { x: 34 + ((box.width - 34 - 12) / 31) * 2.5, y: 160 },
      });
      await expect(activity.locator(".review-activity-detail")).toHaveText(
        "1월 3일리뷰 2건실배송 1건빈박스 1건",
      );
      await expect(activity.getByRole("slider")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      for (const control of [
        activity.getByRole("button", { name: "일별", exact: true }),
        activity.getByRole("combobox"),
      ]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      }
      if (width === 390) {
        await activity
          .locator("..", { has: page.locator(".review-activity") })
          .screenshot({ path: info.outputPath("review-activity-mobile.png") });
      }
    }
  });
});
