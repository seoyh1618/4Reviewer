import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test("shipping payback: empty box includes product price, real delivery is fee-only including zero", async ({
  page,
}) => {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `purchase-payback-${randomUUID()}@example.test`,
          password: "PurchasePayback-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const metric = (name: string) =>
    page.getByRole("region", { name, exact: true }).locator(".metric-value");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await dialog.getByLabel("상품명").fill("구매금액 자동 반영 상품");
  const price = dialog.getByRole("spinbutton", { name: /^구매금액/ });
  const payback = dialog.getByLabel("예상 페이백", { exact: true });
  const preview = dialog.getByRole("group", {
    name: "예상 정산 금액",
    exact: true,
  });
  await price.fill("200000");
  await expect(payback).toHaveCount(0);
  await expect(preview).toContainText("총 받을 금액 0원");
  await dialog.getByLabel("리뷰비", { exact: true }).fill("3000");
  await expect(preview).toContainText("총 받을 금액 3,000원");
  await dialog.getByLabel("리뷰 타입", { exact: true }).selectOption("빈박스");
  await expect(preview).toContainText("총 받을 금액 203,000원");
  await dialog.getByLabel("리뷰비", { exact: true }).fill("0");
  await price.fill("210000");
  await expect(preview).toContainText("총 받을 금액 210,000원");
  await price.fill("200000");
  await dialog
    .getByRole("button", { name: "상품 등록하기", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(metric("누적 구매금액")).toHaveText("200,000원");
  await expect(metric("받을 페이백")).toHaveText("200,000원");
  await expect(metric("입금 완료")).toHaveText("0원");
  await page.screenshot({
    path: "docs/screenshots/shipping-payback-dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  const review = (await (await page.request.get("/api/reviews")).json())
    .reviews[0];
  expect(review.paybackMode).toBe("shipping");
  expect(review.expectedPayback).toBe(200000);
  await page
    .getByRole("button", { name: /구매금액 자동 반영 상품/ })
    .first()
    .click();
  await dialog.getByRole("button", { name: "수정", exact: true }).click();
  await price.fill("220000");
  await expect(payback).toHaveValue("220000");
  await expect(payback).toHaveAttribute("readonly", "");
  await dialog.getByLabel("리뷰 타입", { exact: true }).selectOption("실배송");
  await expect(payback).toHaveValue("0");
  await price.fill("230000");
  await expect(payback).toHaveValue("0");
  await dialog.getByLabel("리뷰 타입", { exact: true }).selectOption("빈박스");
  await expect(payback).toHaveValue("230000");
  await price.fill("200000");
  await expect(payback).toHaveValue("200000");
  await dialog
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("3000");
  await expect(
    dialog.getByRole("group", { name: "정산 예정 금액", exact: true }),
  ).toContainText("총 받을 금액 203,000원");
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("50000");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await expect(metric("누적 구매금액")).toHaveText("200,000원");
  await expect(metric("받을 페이백")).toHaveText("153,000원");
  await expect(metric("입금 완료")).toHaveText("50,000원");
  await page.reload();
  await expect(metric("받을 페이백")).toHaveText("153,000원");
  await page
    .getByRole("button", { name: /구매금액 자동 반영 상품/ })
    .first()
    .click();
  await dialog.getByRole("button", { name: /정산 완료/, exact: false }).click();
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "153000",
  );
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await expect(metric("받을 페이백")).toHaveText("0원");
  await expect(metric("입금 완료")).toHaveText("203,000원");

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "상품 등록", exact: true })
    .first()
    .click();
  await dialog.getByLabel("상품명").fill("실배송 리뷰비 0원 상품");
  await price.fill("30000");
  await expect(preview).toContainText("총 받을 금액 0원");
  await price.fill("40000");
  await expect(preview).toContainText("총 받을 금액 0원");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "상품 등록하기", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.reload();
  const data = await (await page.request.get("/api/reviews")).json();
  const custom = data.reviews.find(
    (r: { name: string }) => r.name === "실배송 리뷰비 0원 상품",
  );
  expect(custom.paybackMode).toBe("shipping");
  expect(custom.expectedPayback).toBe(0);
  await expect(metric("누적 구매금액")).toHaveText("240,000원");
  await expect(metric("받을 페이백")).toHaveText("0원");
  await page
    .getByRole("button", { name: /실배송 리뷰비 0원 상품/ })
    .first()
    .click();
  await expect(
    dialog.getByRole("button", { name: "정산 없음", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog.getByLabel("추가 리뷰비", { exact: true }).fill("3000");
  await expect(
    dialog.getByRole("group", { name: "정산 예정 금액", exact: true }),
  ).toContainText("총 받을 금액 3,000원");
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "3000",
  );
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("1000");
  await page.screenshot({
    path: "docs/screenshots/shipping-payback-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await expect(metric("받을 페이백")).toHaveText("2,000원");
  await expect(metric("누적 구매금액")).toHaveText("240,000원");
  await page.reload();
  await expect(metric("받을 페이백")).toHaveText("2,000원");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
