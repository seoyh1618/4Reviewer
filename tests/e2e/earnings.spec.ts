import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

const earnings = (page: Page) =>
  page.getByRole("region", { name: "수익 요약", exact: true });
const value = (page: Page, name: string) =>
  earnings(page)
    .getByRole("region", { name, exact: true })
    .locator(".earnings-value");

async function account(page: Page) {
  const result = await page.request.post("/api/auth/signup", {
    data: {
      email: `earnings-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(result.status()).toBe(201);
}

test("earnings distinguish cash and goods, stay aligned, and follow review and payment updates", async ({
  page,
}, info) => {
  await account(page);
  const create = async (overrides: Record<string, unknown>) => {
    const result = await page.request.post("/api/reviews", {
      data: {
        name: "빈박스 분할 정산",
        platform: "쿠팡",
        shippingMethod: "빈박스",
        price: 10000,
        additionalReviewFee: 3000,
        purchaseDate: "2025-12-15",
        reviewType: "사진 리뷰",
        reviewStatus: "done",
        reviewedAt: "2025-12-20",
        ...overrides,
      },
    });
    expect(result.status()).toBe(201);
    return (await result.json()).review;
  };
  let empty = await create({ receivedAmount: 8000, paidAt: "2025-12-22" });
  for (const [receivedAmount, paidAt] of [
    [12000, "2026-01-05"],
    [13000, "2026-02-05"],
  ]) {
    const result = await page.request.put(`/api/reviews/${empty.id}`, {
      data: { ...empty, receivedAmount, paidAt },
    });
    expect(result.status()).toBe(200);
    empty = (await result.json()).review;
  }
  await create({
    name: "실배송 수익 확인",
    shippingMethod: "실배송",
    price: 20000,
    additionalReviewFee: 2000,
    purchaseDate: "2026-01-10",
    reviewStatus: "todo",
    reviewedAt: "",
  });
  await create({
    name: "리뷰비 없는 실배송",
    shippingMethod: "실배송",
    price: 15000,
    additionalReviewFee: 0,
    purchaseDate: "2026-02-10",
    reviewStatus: "todo",
    reviewedAt: "",
  });
  await page.goto("/");
  await expect(page.getByText("리뷰 활동 수익", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("group", { name: "월별 구매금액과 입금액", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".order-trend")).toHaveCount(0);
  await expect(value(page, "총수익")).toHaveText("38,000원");
  await expect(value(page, "현금 수익")).toHaveText("3,000원");
  await expect(value(page, "상품 수익")).toHaveText("35,000원");
  await expect(earnings(page)).toContainText("미입금 리뷰비 포함 40,000원");
  await expect(earnings(page)).toContainText("입금 대기 2,000원");
  await expect(
    page
      .getByRole("region", { name: "정산 금액", exact: true })
      .locator(".metric-value"),
  ).toHaveText("13,000원");
  for (const width of [1858, 1440, 1024, 821, 768, 600, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    const boxes = await earnings(page)
      .locator(".earnings-card")
      .evaluateAll((nodes) =>
        nodes.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            width: r.width,
            height: r.height,
            overflow: el.scrollWidth > el.clientWidth,
          };
        }),
      );
    expect(
      Math.max(...boxes.map((b) => b.width)) -
        Math.min(...boxes.map((b) => b.width)),
    ).toBeLessThan(1);
    expect(boxes.every((b) => !b.overflow)).toBe(true);
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      page: document.documentElement.scrollWidth,
      outside: [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 15)
        .map((el) => ({
          tag: el.tagName,
          cls: el.className,
          right: el.getBoundingClientRect().right,
        })),
    }));
    expect(overflow.page, JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    if (width > 600)
      expect(
        Math.max(...boxes.map((b) => b.height)) -
          Math.min(...boxes.map((b) => b.height)),
      ).toBeLessThan(1);
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: info.outputPath(`dashboard-${width}.png`),
        fullPage: true,
      });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include(".earnings-section")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/?view=products");
  await page.getByLabel("상품 검색").fill("실배송 수익 확인");
  await page.locator(".mobile-product").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.goto("/");
  await expect(value(page, "총수익")).toHaveText("38,000원");
  await page.goto("/?view=products");
  await page.getByLabel("상품 검색").fill("실배송 수익 확인");
  await page.locator(".mobile-product").click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.goto("/");
  await expect(value(page, "총수익")).toHaveText("40,000원");
  await expect(value(page, "현금 수익")).toHaveText("5,000원");
  await expect(earnings(page)).toContainText("입금 대기 0원");
  await page.reload();
  await expect(value(page, "총수익")).toHaveText("40,000원");

  await page.goto("/?view=insights&statsYear=2026&statsMonth=01");
  const composition = page.getByRole("region", {
    name: "수익 구성",
    exact: true,
  });
  await expect(composition.locator(".analysis-income-total strong")).toHaveText(
    "22,000원",
  );
  await expect(composition.locator(".analysis-bar-label strong")).toHaveText([
    "2,000원",
    "20,000원",
  ]);
  await page.locator(".analysis-detail summary").click();
  const table = page.getByRole("region", {
    name: "월별 상세 내역",
    exact: true,
  });
  await expect(table.locator("tbody td")).toHaveText([
    "2026년 01월",
    "1건",
    "1건",
    "20,000원",
    "4,000원",
    "2,000원",
    "20,000원",
    "22,000원",
  ]);
  await page.getByRole("combobox", { name: "통계 월" }).selectOption("02");
  await expect(composition.locator(".analysis-income-total strong")).toHaveText(
    "16,000원",
  );
  await expect(composition.locator(".analysis-bar-label strong")).toHaveText([
    "1,000원",
    "15,000원",
  ]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: info.outputPath("insights-1440.png"),
    fullPage: true,
  });
});

test("empty income remains visible and zero-valued on mobile", async ({
  page,
}) => {
  await account(page);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  for (const name of ["총수익", "현금 수익", "상품 수익"])
    await expect(value(page, name)).toHaveText("0원");
  await expect(earnings(page)).toContainText("실배송 0건");
  await expect(earnings(page)).toContainText("입금 대기 0원");
});
