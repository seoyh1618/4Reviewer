import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../shared/domain.mjs";

test.use({ actionTimeout: 15000 });
async function start(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `fee-${randomUUID()}@example.test`,
          password: "ReviewFee-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/");
}
const state = async (page: Page) =>
  (await page.request.get("/api/reviews")).json();

test("additional review fee: review entry, payment adjustment, pending filters, totals and CSV", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await start(page);
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("리뷰비", { exact: true })).toHaveValue("0");
  await expect(dialog.getByLabel("예상 페이백", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByRole("heading", { name: "예상 페이백", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".form-section-heading > span")).toHaveText([
    "01",
    "02",
    "03",
  ]);
  await dialog.getByLabel("상품명").fill("추가 리뷰비 텀블러");
  await dialog.getByLabel("리뷰 타입", { exact: true }).selectOption("빈박스");
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("30000");
  await dialog.getByLabel("리뷰비", { exact: true }).fill("2000");
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("35000");
  await expect(dialog.getByLabel("리뷰비", { exact: true })).toHaveValue(
    "2000",
  );
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("30000");
  for (const width of [1440, 360, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await dialog.locator(".registration-amounts").scrollIntoViewIfNeeded();
    const price = (await dialog
      .getByRole("spinbutton", { name: /^구매금액/ })
      .boundingBox())!;
    const fee = (await dialog
      .getByLabel("리뷰비", { exact: true })
      .boundingBox())!;
    expect(Math.abs(price.y - fee.y)).toBeLessThan(1);
    expect(fee.x).toBeGreaterThan(price.x + price.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width !== 360) {
      await page.screenshot({
        path: `docs/screenshots/registration-review-fee-${width}.png`,
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
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog
    .getByRole("button", { name: "상품 등록하기", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect((await state(page)).reviews[0]).toMatchObject({
    price: 30000,
    expectedPayback: 30000,
    paybackMode: "shipping",
    additionalReviewFee: 2000,
    receivedAmount: 0,
    reviewStatus: "todo",
  });
  expect((await state(page)).payments).toHaveLength(0);
  await expect(
    page
      .getByRole("region", { name: "받을 페이백", exact: true })
      .locator(".metric-value"),
  ).toHaveText("32,000원");
  await page.reload();
  const nav = page.getByRole("navigation", { name: "메인 메뉴", exact: true });
  const metric = (name: string) =>
    page.getByRole("region", { name, exact: true }).locator(".metric-value");
  await nav.getByRole("button", { name: /^내 리뷰/ }).click();
  const steps = page
    .getByRole("region", { name: "내 리뷰 목록", exact: true })
    .getByRole("group", { name: "추가 리뷰비 텀블러 진행 단계", exact: true });
  await steps.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await expect(dialog.getByLabel("추가 리뷰비", { exact: true })).toHaveValue(
    "2000",
  );
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("3000");
  await expect(
    dialog.getByRole("group", { name: "정산 예정 금액" }),
  ).toContainText("총 받을 금액 33,000원");
  await page.screenshot({
    path: "docs/screenshots/additional-review-fee.png",
    fullPage: false,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  expect((await state(page)).reviews[0]).toMatchObject({
    expectedPayback: 30000,
    additionalReviewFee: 3000,
    receivedAmount: 0,
  });
  expect((await state(page)).payments).toHaveLength(0);
  // Saving the same fee replaces its value; it does not add a second fee.
  await page.locator("tbody .product-name-button").first().click();
  await dialog
    .getByRole("button", { name: "리뷰 정보 수정", exact: true })
    .click();
  await expect(dialog.getByLabel("추가 리뷰비", { exact: true })).toHaveValue(
    "3000",
  );
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await nav.getByRole("button", { name: "대시보드", exact: true }).click();
  await expect(metric("받을 페이백")).toHaveText("33,000원");
  await expect(metric("누적 구매금액")).toHaveText("30,000원");
  await expect(metric("정산 금액")).toHaveText("0원");
  await nav.getByRole("button", { name: /^내 리뷰/ }).click();
  await steps
    .getByRole("button", { name: "정산 완료 전환", exact: true })
    .click();
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "33000",
  );
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("5000");
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "35000",
  );
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("30000");
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("4000");
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "30000",
  );
  await expect(
    dialog.getByRole("status", { name: "입금 후 정산 상태" }),
  ).toContainText("저장 후 남은 페이백 4,000원");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await nav.getByRole("button", { name: "대시보드", exact: true }).click();
  await expect(metric("받을 페이백")).toHaveText("4,000원");
  await expect(metric("정산 금액")).toHaveText("30,000원");
  await nav.getByRole("button", { name: /^페이백/ }).click();
  await page.getByRole("tab", { name: "입금 대기", exact: true }).click();
  const table = page.getByRole("region", { name: "페이백 목록", exact: true });
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(
    table.getByRole("columnheader", { name: "추가 리뷰비", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "입금 완료", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("tab", { name: "입금 대기", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  expect(csv).toContain('"추가 리뷰비","총 받을 금액"');
  expect(csv).toContain('"30000","4000","34000","30000"');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-product").click();
  const mobileSteps = page
    .getByRole("dialog")
    .getByRole("group", { name: "추가 리뷰비 텀블러 진행 단계" });
  await mobileSteps
    .getByRole("button", { name: "정산 완료", exact: true })
    .click();
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "4000",
  );
  await page.screenshot({
    path: "docs/screenshots/additional-review-fee-payment-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await expect(dialog).toBeHidden();
  const complete = await state(page);
  expect(complete.reviews[0]).toMatchObject({
    expectedPayback: 30000,
    additionalReviewFee: 4000,
    receivedAmount: 34000,
  });
  expect(
    complete.payments
      .map((p: { amount: number }) => p.amount)
      .sort((a: number, b: number) => a - b),
  ).toEqual([4000, 30000]);
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "통계", exact: true })
    .click();
  const composition = page.getByRole("region", {
    name: "수익 구성",
    exact: true,
  });
  await expect(
    composition.locator(".analysis-income-context dd").last(),
  ).toHaveText("34,000원");
  await expect(composition.locator(".analysis-income-total strong")).toHaveText(
    "4,000원",
  );
  await page.locator(".analysis-detail summary").click();
  await expect(
    page.locator("tbody tr").first().getByRole("cell").nth(3),
  ).toHaveText("30,000원");
  await expect(
    page.locator("tbody tr").first().getByRole("cell").nth(4),
  ).toHaveText("34,000원");
  await page.reload();
  await expect(
    composition.locator(".analysis-income-context dd").last(),
  ).toHaveText("34,000원");
});

test("additional review fee: fee-only mobile settlement, save retry and paid amount protection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await start(page);
  const created = await page.request.post("/api/reviews", {
    data: {
      name: "리뷰비만 받는 상품",
      platform: "쿠팡",
      shippingMethod: "실배송",
      price: 30000,
      expectedPayback: 0,
      purchaseDate: today(),
      reviewStatus: "done",
      reviewedAt: today(),
      reviewType: "사진 리뷰",
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).review.id;
  await page.reload();
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "내 리뷰", exact: true })
    .click();
  await page.locator(".mobile-product").click();
  const steps = page
    .getByRole("dialog")
    .getByRole("group", { name: "리뷰비만 받는 상품 진행 단계", exact: true });
  await expect(
    steps.getByRole("button", { name: "정산 완료", exact: true }),
  ).toBeEnabled();
  await expect(steps.getByRole("button")).toHaveCount(1);
  await steps.getByRole("button", { name: "정산 완료", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "정산 완료 저장", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByText(/현재 받을 금액이 0원/)).toBeVisible();
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("2000");
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "2000",
  );
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("1000");
  await page.route(`**/api/reviews/${id}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "일시적인 저장 오류" }),
    }),
  );
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("일시적인 저장 오류");
  await expect(dialog.getByLabel("추가 리뷰비", { exact: true })).toHaveValue(
    "2000",
  );
  await page.unroute(`**/api/reviews/${id}`);
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await expect(
    steps.getByRole("button", { name: "정산 완료", exact: true }),
  ).toBeEnabled();
  await steps.getByRole("button", { name: "정산 완료", exact: true }).click();
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "1000",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await expect(steps.getByRole("button")).toHaveCount(0);
  await expect(steps).toHaveText("정산 완료");
  await dialog
    .getByRole("button", { name: "리뷰 정보 수정", exact: true })
    .click();
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("1000");
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "입금액은 예상 페이백과 추가 리뷰비의 합계를 초과할 수 없습니다.",
  );
  expect((await state(page)).reviews[0]).toMatchObject({
    additionalReviewFee: 2000,
    receivedAmount: 2000,
  });
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.reload();
  await expect(page.locator(".mobile-product")).toContainText("입금 완료");
  await page.locator(".mobile-product").click();
  await expect(
    page.getByRole("dialog").getByText("2,000원", { exact: true }).first(),
  ).toBeVisible();
});
