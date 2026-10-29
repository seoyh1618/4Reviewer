import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../shared/domain.mjs";

test.use({ actionTimeout: 15000 });

test("review KPIs split review types and receivables and reflect partial/full settlements", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `kpis-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  const create = async (
    name: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const response = await page.request.post("/api/reviews", {
      data: {
        name,
        platform: "쿠팡",
        price: 10000,
        shippingMethod: "빈박스",
        additionalReviewFee: 3000,
        purchaseDate: today(),
        reviewType: "사진 리뷰",
        reviewStatus: "todo",
        paidAt: today(),
        ...overrides,
      },
    });
    expect(response.status()).toBe(201);
  };
  await create("원가 일부 받은 작성 전", { receivedAmount: 4000 });
  await create("실배송 작성 전", {
    platform: "네이버",
    shippingMethod: "실배송",
    price: 20000,
    additionalReviewFee: 2000,
  });
  await create("정산까지 완료", {
    reviewStatus: "done",
    reviewedAt: today(),
    receivedAmount: 13000,
  });
  await create("리뷰비 없는 실배송", {
    reviewStatus: "done",
    reviewedAt: today(),
    shippingMethod: "실배송",
    additionalReviewFee: 0,
  });
  await create("리뷰 전 선입금", { receivedAmount: 13000 });
  await create("실배송 리뷰비 부분 입금", {
    reviewStatus: "done",
    reviewedAt: today(),
    shippingMethod: "실배송",
    additionalReviewFee: 2000,
    receivedAmount: 500,
  });
  await create("정산 전환 대상", {
    reviewStatus: "done",
    reviewedAt: today(),
    price: 6000,
    additionalReviewFee: 1000,
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=products");
  const kpis = page.getByRole("region", {
    name: "내 리뷰 핵심 지표",
    exact: true,
    includeHidden: true,
  });
  const values = kpis.locator(".review-kpi-value");
  const types = kpis.getByLabel("작성 전 리뷰 타입별 건수", { exact: true });
  const completedTypes = kpis.getByLabel("완료한 리뷰 타입별 건수", {
    exact: true,
  });
  const received = kpis.getByLabel("누적 정산금액", { exact: true });
  const parts = kpis.getByLabel("받을 페이백 구성", { exact: true });
  await expect(values).toHaveText(["7건", "2건", "3건", "4건", "19,500원"]);
  await expect(types).toContainText("실배송 1건");
  await expect(types).toContainText("빈박스 2건");
  await expect(completedTypes).toContainText("실배송 2건");
  await expect(completedTypes).toContainText("빈박스 2건");
  await expect(received).toHaveText("정산금액 30,500원");
  await expect(parts).toContainText("상품 원가 12,000원");
  await expect(parts).toContainText("리뷰비 7,500원");
  await expect(kpis).toContainText("부분 입금은 상품 원가부터 차감");
  await expect(
    page.getByRole("columnheader", { name: "정산일", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/최근\s?입금일/)).toHaveCount(0);

  for (const width of [1440, 1024, 821, 820, 768, 601, 390, 360]) {
    await page.setViewportSize({ width, height: width > 768 ? 1000 : 844 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return document.fonts.ready;
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width <= 820) {
      await expect(kpis).toBeHidden();
      await expect(kpis.locator(".sr-only")).toBeHidden();
    } else {
      await expect(kpis).toBeVisible();
      expect(
        await kpis.evaluate((el) =>
          [...el.querySelectorAll(".review-kpi-card")].every(
            (card) => card.scrollWidth <= card.clientWidth,
          ),
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: `docs/screenshots/review-kpis-breakdown-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    (
      await new AxeBuilder({ page })
        .include(".review-kpis")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("리뷰 타입 필터").selectOption("실배송");
  await expect(values).toHaveText(["3건", "0건", "1건", "2건", "3,500원"]);
  await expect(completedTypes).toContainText("실배송 2건");
  await expect(completedTypes).toContainText("빈박스 0건");
  await expect(received).toHaveText("정산금액 500원");
  await expect(parts).toContainText("상품 원가 0원");
  await expect(parts).toContainText("리뷰비 3,500원");
  await page.getByLabel("플랫폼 필터").selectOption("네이버");
  await expect(values).toHaveText(["1건", "0건", "1건", "0건", "2,000원"]);
  await page.getByRole("tab", { name: "리뷰 완료", exact: true }).click();
  await expect(values).toHaveText(["1건", "0건", "1건", "0건", "2,000원"]);
  await page.getByLabel("상품 검색").fill("없는 리뷰");
  await expect(values).toHaveText(["0건", "0건", "0건", "0건", "0원"]);
  await expect(completedTypes).toContainText("실배송 0건");
  await expect(completedTypes).toContainText("빈박스 0건");
  await expect(received).toHaveText("정산금액 0원");
  await expect(parts).toContainText("상품 원가 0원");
  await expect(parts).toContainText("리뷰비 0원");
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await page
    .getByRole("button", { name: "칸반뷰로 보기", exact: true })
    .click();
  await expect(values).toHaveText(["7건", "2건", "3건", "4건", "19,500원"]);
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(kpis).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(kpis).toBeVisible();
  await page.setViewportSize({ width: 360, height: 844 });
  await expect(kpis).toBeHidden();
  await expect(page.locator(".review-view-toggle")).toHaveCount(0);
  await expect(page.locator(".review-kanban")).toHaveCount(0);
  await page.getByLabel("상품 검색").fill("정산 전환 대상");
  await expect(values).toHaveText(["1건", "0건", "0건", "1건", "7,000원"]);
  await page.locator(".mobile-product").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).not.toContainText("최근 입금일");
  await expect(
    dialog.locator("dt").filter({ hasText: /^정산일$/ }),
  ).toHaveCount(1);
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await expect(dialog.getByLabel("정산일", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("3000");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(values).toHaveText(["1건", "0건", "0건", "1건", "4,000원"]);
  await expect(received).toHaveText("정산금액 3,000원");
  await expect(parts).toContainText("상품 원가 3,000원");
  await expect(parts).toContainText("리뷰비 1,000원");
  await page.locator(".mobile-product").click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(values).toHaveText(["1건", "1건", "0건", "1건", "0원"]);
  await expect(received).toHaveText("정산금액 7,000원");
  await expect(parts).toContainText("상품 원가 0원");
  await expect(parts).toContainText("리뷰비 0원");
  await page.getByLabel("상품 검색").fill("");
  await expect(values).toHaveText(["7건", "3건", "3건", "4건", "12,500원"]);
  await page.getByLabel("상품 검색").fill("원가 일부 받은 작성 전");
  await page.locator(".mobile-product").click();
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(types).toContainText("빈박스 0건");
  await expect(values).toHaveText(["1건", "0건", "0건", "1건", "9,000원"]);
  await page.getByLabel("상품 검색").fill("");
  await page.reload();
  await expect(values).toHaveText(["7건", "3건", "2건", "5건", "12,500원"]);
  await expect(completedTypes).toContainText("실배송 2건");
  await expect(completedTypes).toContainText("빈박스 3건");
  await expect(received).toHaveText("정산금액 37,500원");
  await expect(
    page.getByRole("button", { name: "내보내기", exact: true }),
  ).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain('"정산일"');
  expect(csv).not.toContain("최근 입금일");
});
