import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { today } from "../../shared/domain.mjs";

test("review type filter coordinates records, counts, KPIs, export and URL restoration", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `type-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  for (let i = 0; i < 23; i++) {
    const item = {
      name: i < 21 ? `빈박스 텀블러 ${i}` : `실배송 상품 ${i}`,
      shippingMethod: i < 21 ? "빈박스" : "실배송",
      platform: i === 20 || i === 22 ? "네이버" : "쿠팡",
      price: 10000,
      additionalReviewFee: i < 21 ? 1000 : 2000,
      purchaseDate: today(),
      reviewType: "사진 리뷰",
      reviewStatus: i === 20 || i === 22 ? "done" : "todo",
      reviewedAt: i === 20 || i === 22 ? today() : "",
    };
    const result = await page.request.post("/api/reviews", { data: item });
    expect(result.status()).toBe(201);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=products");
  const type = page.getByLabel("리뷰 타입 필터", { exact: true });
  const kpis = page.locator(".review-kpis dd");
  await expect(type.locator("option")).toHaveText([
    "모든 리뷰 타입",
    "실배송",
    "빈박스",
  ]);
  await expect(
    page.getByRole("columnheader", { name: "리뷰 타입", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await type.selectOption("실배송");
  await expect(
    page.getByRole("button", { name: "이전 페이지", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".product-data-table tbody tr")).toHaveCount(2);
  await expect(kpis).toHaveText(["2건", "0건", "1건", "1건", "4,000원"]);
  await expect(page.locator(".status-count")).toHaveText([
    "2",
    "1",
    "1",
    "0",
    "0",
  ]);
  await expect(page).toHaveURL(/shipping=/);
  await page.reload();
  await expect(type).toHaveValue("실배송");
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: "리뷰 캘린더", exact: true })
    .click();
  await page.goBack();
  await expect(type).toHaveValue("실배송");

  await page.getByLabel("플랫폼 필터").selectOption("쿠팡");
  await expect(kpis).toHaveText(["1건", "0건", "1건", "0건", "2,000원"]);
  await page.getByRole("tab", { name: "리뷰 완료", exact: true }).click();
  await expect(
    page.getByText("검색 결과가 없어요", { exact: true }),
  ).toBeVisible();
  await expect(kpis).toHaveText(["1건", "0건", "1건", "0건", "2,000원"]);
  await page.getByRole("tab", { name: "전체 상품", exact: true }).click();
  await page.getByLabel("플랫폼 필터").selectOption("");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"리뷰 타입"');
  expect(csv).toContain("실배송 상품 21");
  expect(csv).toContain("실배송 상품 22");
  expect(csv).not.toContain("빈박스");
  expect(csv).not.toContain("배송 방식");

  for (const width of [1440, 768, 601, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(type).toHaveValue("실배송");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const platformBox = (await page.getByLabel("플랫폼 필터").boundingBox())!;
    const typeBox = (await type.boundingBox())!;
    expect(typeBox.y).toBe(platformBox.y);
    expect(typeBox.x).toBeGreaterThanOrEqual(platformBox.x + platformBox.width);
    expect(typeBox.height).toBeGreaterThanOrEqual(44);
    if (width <= 600)
      await expect(page.locator(".mobile-product")).toHaveCount(2);
    await page.screenshot({
      path: `docs/screenshots/review-type-filter-${width}.png`,
      animations: "disabled",
    });
  }
  await type.selectOption("빈박스");
  await expect(kpis).toHaveText(["21건", "0건", "20건", "1건", "231,000원"]);
  await page.getByLabel("상품 검색").fill("없는 상품");
  await expect(kpis).toHaveText(["0건", "0건", "0건", "0건", "0원"]);
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await expect(type).toHaveValue("");
  await expect(kpis).toHaveText(["23건", "0건", "21건", "2건", "235,000원"]);
  await page.goto("/?view=products&shipping=invalid");
  await expect(type).toHaveValue("");
  await expect(kpis).toHaveText(["23건", "0건", "21건", "2건", "235,000원"]);
  await page.goto("/?view=payback");
  await type.selectOption("실배송");
  await expect(page.locator(".mobile-product")).toHaveCount(2);
});
