import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

const chart = (page: Page) =>
  page.getByRole("group", { name: "월별 구매금액과 입금액", exact: true });
const metric = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true }).locator(".metric-value");
const year = (page: Page) => page.getByRole("combobox", { name: "통계 연도" });
const month = (page: Page) => page.getByRole("combobox", { name: "통계 월" });
const detail = (page: Page) =>
  page.getByRole("region", { name: "월별 상세 내역", exact: true });

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

test("statistics period: year/month totals, cross-period deposits, history and full export", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  await expect(year(page)).toHaveValue("");
  await expect(month(page)).toBeDisabled();
  await expect(metric(page, "누적 구매금액")).toHaveText("100,000원");
  await expect(metric(page, "입금 완료")).toHaveText("68,000원");
  await expect(year(page).getByRole("option", { name: "2027년" })).toHaveCount(
    1,
  );
  const filterBounds = (await page
    .getByRole("group", { name: "통계 기간 필터" })
    .boundingBox())!;
  const exportBounds = (await page
    .getByRole("button", { name: "전체 데이터 내보내기" })
    .boundingBox())!;
  expect(filterBounds.x + filterBounds.width).toBeLessThan(exportBounds.x);
  expect(Math.abs(filterBounds.y - exportBounds.y)).toBeLessThan(2);

  await year(page).selectOption("2025");
  await expect(month(page)).toBeEnabled();
  await expect(chart(page).getByRole("button")).toHaveCount(12);
  await expect(detail(page).locator("tbody tr")).toHaveCount(12);
  await expect(metric(page, "누적 구매금액")).toHaveText("40,000원");
  await expect(metric(page, "입금 완료")).toHaveText("45,000원");
  await expect(metric(page, "받을 페이백")).toHaveText("42,000원");
  await expect(metric(page, "작성해야 할 리뷰")).toHaveText("1건");
  await expect(page.locator(".platform-stats progress")).toHaveCount(2);
  await expect(page.locator(".platform-stats")).toContainText("50%");
  await chart(page).getByRole("button").nth(1).hover();
  await expect(page.getByRole("tooltip").locator("dd")).toHaveText([
    "10,000원",
    "35,000원",
  ]);
  await page.getByRole("heading", { name: "나의 리뷰 통계" }).hover();
  await page.screenshot({
    path: "docs/screenshots/insights-year-filter-1440.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);

  await month(page).selectOption("01");
  await expect(metric(page, "누적 구매금액")).toHaveText("30,000원");
  await expect(metric(page, "입금 완료")).toHaveText("10,000원");
  await expect(metric(page, "받을 페이백")).toHaveText("32,000원");
  await expect(metric(page, "작성해야 할 리뷰")).toHaveText("0건");
  await expect(chart(page).getByRole("button")).toHaveCount(1);
  await expect(detail(page).locator("tbody tr")).toHaveText([
    "2025년 01월1건1건30,000원10,000원",
  ]);
  await expect(page.locator(".platform-stats")).toContainText("네이버");
  await expect(page.locator(".platform-stats")).toContainText("100%");
  await page.reload();
  await expect(year(page)).toHaveValue("2025");
  await expect(month(page)).toHaveValue("01");
  await expect(metric(page, "입금 완료")).toHaveText("10,000원");
  await month(page).selectOption("02");
  await expect(metric(page, "입금 완료")).toHaveText("35,000원");
  await page.goBack();
  await expect(month(page)).toHaveValue("01");
  await page.goForward();
  await expect(month(page)).toHaveValue("02");

  // The explicitly named full-data export remains a backup of all reviews.
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 데이터 내보내기" }).click();
  const csv = await readFile((await (await downloaded).path())!, "utf8");
  for (const name of [
    "전년 구매 분할 입금",
    "1월 리뷰",
    "2월 작성 전",
    "다음 해 입금",
  ])
    expect(csv).toContain(name);

  await month(page).selectOption("03");
  for (const name of ["누적 구매금액", "입금 완료", "받을 페이백"])
    await expect(metric(page, name)).toHaveText("0원");
  await expect(
    page.getByText("선택한 기간에 구매한 상품이 없어요"),
  ).toBeVisible();
  await year(page).selectOption("2027");
  await month(page).selectOption("01");
  await expect(metric(page, "누적 구매금액")).toHaveText("0원");
  await expect(metric(page, "입금 완료")).toHaveText("23,000원");
  await expect(detail(page).locator("tbody tr")).toHaveText([
    "2027년 01월0건0건0원23,000원",
  ]);
  await year(page).selectOption("");
  await expect(month(page)).toHaveValue("");
  await expect(month(page)).toBeDisabled();
  await expect(metric(page, "누적 구매금액")).toHaveText("100,000원");
  await expect(page).not.toHaveURL(/statsYear|statsMonth/);
  expect(errors).toEqual([]);
});

test.describe("touch statistics periods", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("statistics period: mobile controls, annual scrolling and amount popups", async ({
    page,
  }) => {
    await seed(page);
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await year(page).selectOption("2025");
      await month(page).selectOption("");
      for (const control of [year(page), month(page)]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      }
      const buttons = chart(page).getByRole("button");
      for (const index of [0, 11, 1]) {
        const button = buttons.nth(index);
        await button.scrollIntoViewIfNeeded();
        const bounds = (await button.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        await button.tap({
          position: { x: bounds.width / 2, y: bounds.height - 12 },
        });
        const tooltip = page.getByRole("tooltip");
        await expect(tooltip).toBeInViewport();
        await expect(tooltip.locator("dd")).toHaveText(
          index === 0
            ? ["30,000원", "10,000원"]
            : index === 1
              ? ["10,000원", "35,000원"]
              : ["0원", "0원"],
        );
        const tip = (await tooltip.boundingBox())!;
        expect(tip.x).toBeGreaterThanOrEqual(0);
        expect(tip.x + tip.width).toBeLessThanOrEqual(width);
      }
      await month(page).selectOption("02");
      await expect(chart(page).getByRole("button")).toHaveCount(1);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await expect(metric(page, "입금 완료")).toHaveText("35,000원");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: "docs/screenshots/insights-month-filter-390.png",
          fullPage: true,
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
    }
  });
});

test("statistics period: empty accounts and invalid URL filters", async ({
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
  await expect(chart(page).getByRole("button")).toHaveCount(12);
  await expect(metric(page, "입금 완료")).toHaveText("0원");
  await expect(page).not.toHaveURL(/statsMonth/);
  await year(page).focus();
  await page.keyboard.press("Tab");
  await expect(month(page)).toBeFocused();
  await month(page).selectOption("01");
  await expect(month(page)).toHaveValue("01");
  await expect(chart(page).getByRole("button")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "전체 데이터 내보내기" }),
  ).toBeFocused();
});
