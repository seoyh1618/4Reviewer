import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../shared/domain.mjs";

test("next action: a single transition per review, zero-payback entry and already-paid review", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `next-action-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  const records = [
    { name: "데일리 텀블러", reviewStatus: "todo", receivedAmount: 0 },
    { name: "무선 충전기", reviewStatus: "done", receivedAmount: 0 },
    { name: "핸드 크림", reviewStatus: "done", receivedAmount: 23000 },
    {
      name: "리뷰비 입력 전 상품",
      reviewStatus: "done",
      receivedAmount: 0,
      shippingMethod: "실배송",
      additionalReviewFee: 0,
    },
    {
      name: "입금을 먼저 받은 상품",
      reviewStatus: "todo",
      receivedAmount: 23000,
    },
  ];
  for (const record of records) {
    const created = await page.request.post("/api/reviews", {
      data: {
        price: 20000,
        additionalReviewFee: 3000,
        platform: "쿠팡",
        shippingMethod: "빈박스",
        purchaseDate: today(),
        paidAt: record.receivedAmount ? today() : "",
        reviewType: "사진 리뷰",
        reviewedAt: record.reviewStatus === "done" ? today() : "",
        ...record,
      },
    });
    expect(created.status()).toBe(201);
  }
  await page.goto("/?view=products");
  const table = page.getByRole("region", { name: "내 리뷰 목록", exact: true });
  const action = (name: string) =>
    table.getByRole("group", { name: `${name} 진행 단계`, exact: true });
  await expect(
    table.getByRole("columnheader", { name: "진행 단계", exact: true }),
  ).toBeVisible();
  await expect(table.locator(".sticky-product .review-progress")).toHaveCount(
    0,
  );
  await expect(table.locator(".review-progress-action svg")).toHaveCount(0);
  for (const record of records) {
    const group = action(record.name);
    if (record.reviewStatus === "done" && record.receivedAmount > 0) {
      await expect(group.getByRole("button")).toHaveCount(0);
      await expect(group).toHaveText("정산 완료");
    } else {
      await expect(group.getByRole("button")).toHaveCount(1);
      await expect(
        group.getByRole("button", {
          name: record.reviewStatus === "todo" ? "리뷰 완료" : "정산 완료 전환",
          exact: true,
        }),
      ).toBeEnabled();
    }
    await expect(
      group.getByRole("button", { name: /작성 전|정산 없음/ }),
    ).toHaveCount(0);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".product-panel").screenshot({
    path: "docs/screenshots/next-action-desktop.png",
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);

  // Both lists keep the action outside the product identity cell.
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: /^페이백/ })
    .click();
  const paybackTable = page.getByRole("region", {
    name: "페이백 목록",
    exact: true,
  });
  await expect(
    paybackTable.getByRole("columnheader", { name: "진행 단계", exact: true }),
  ).toBeVisible();
  await expect(
    paybackTable.locator(".sticky-product .review-progress"),
  ).toHaveCount(0);
  await paybackTable
    .getByRole("group", { name: "무선 충전기 진행 단계", exact: true })
    .getByRole("button")
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "정산 정보 입력", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: /^내 리뷰/ })
    .click();

  // Keyboard activation opens the matching information dialog.
  await action("데일리 텀블러").getByRole("button").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "리뷰 완료 입력", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(action("데일리 텀블러").getByRole("button")).toBeFocused();

  await action("리뷰비 입력 전 상품").getByRole("button").click();
  await expect(
    dialog.getByRole("heading", { name: "정산 정보 입력", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "정산 완료 저장", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();

  // An earlier deposit does not skip the review or create another payment.
  const before = await (await page.request.get("/api/reviews")).json();
  await action("입금을 먼저 받은 상품").getByRole("button").click();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(action("입금을 먼저 받은 상품").getByRole("button")).toHaveCount(
    0,
  );
  await expect(action("입금을 먼저 받은 상품")).toHaveText("정산 완료");
  const after = await (await page.request.get("/api/reviews")).json();
  expect(after.payments).toEqual(before.payments);

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".mobile-product")
    .filter({ hasText: "무선 충전기" })
    .click();
  const next = dialog.getByRole("group", {
    name: "무선 충전기 진행 단계",
    exact: true,
  });
  await expect(next.getByRole("button")).toHaveCount(1);
  await expect(next.locator("button svg")).toHaveCount(0);
  const bounds = (await next
    .getByRole("button", { name: "정산 완료", exact: true })
    .boundingBox())!;
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({
    path: "docs/screenshots/next-action-mobile.png",
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await next.getByRole("button").click();
  await expect(
    dialog.getByRole("heading", { name: "정산 정보 입력", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(
    next.getByRole("button", { name: "정산 완료", exact: true }),
  ).toBeEnabled();
});
