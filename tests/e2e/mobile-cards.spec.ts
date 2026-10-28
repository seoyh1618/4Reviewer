import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { today, dateOffset } from "../../shared/domain.mjs";

test("compact mobile cards open an overlay and keep status counts current", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `cards-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  const name =
    "스테인리스 보온 텀블러 500ml 크림 화이트 한정 구성과 추가 빨대 세트";
  const cases = [
    {
      name,
      dueDate: dateOffset(1),
      kakaoName: "리뷰 제안 담당자",
      memo: "사진 3장과 사용 경험을 작성해 주세요.",
      orderNumber: "ORDER-MOBILE-001",
    },
    {
      name: "데일리 핸드크림",
      reviewStatus: "done",
      reviewedAt: today(),
      receivedAmount: 4000,
      paidAt: today(),
    },
    {
      name: "무선 탁상 조명",
      reviewStatus: "done",
      reviewedAt: today(),
      receivedAmount: 10000,
      paidAt: today(),
    },
    { name: "유리 머그컵", platform: "네이버" },
  ];
  for (const item of cases) {
    const result = await page.request.post("/api/reviews", {
      data: {
        platform: "쿠팡",
        price: 10000,
        expectedPayback: 10000,
        purchaseDate: today(),
        shippingMethod: "빈박스",
        reviewType: "사진 리뷰",
        reviewStatus: "todo",
        ...item,
      },
    });
    expect(result.status()).toBe(201);
  }
  const tabs = page.getByRole("tablist", { name: "상품 진행 상태" });
  const counts = tabs.locator(".status-count");
  const dialog = page.getByRole("dialog");
  const closeDetail = () =>
    dialog.getByRole("button", { name: "닫기", exact: true }).last().click();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?view=products");
    await expect(counts).toHaveText(["4", "2", "2", "1", "1"]);
    await expect(
      tabs.getByRole("tab", { name: "작성 전", exact: true }),
    ).toHaveAccessibleDescription("2개");
    expect(await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const cards = page.locator(".mobile-product");
    await expect(cards).toHaveCount(4);
    for (const card of await cards.all()) {
      expect((await card.boundingBox())!.height).toBeLessThanOrEqual(150);
      await expect(card.locator("dl")).toHaveCount(0);
      await expect(card.getByRole("group")).toHaveCount(0);
    }
    await expect(cards.first()).not.toContainText("리뷰 제안 담당자");
    await page.screenshot({
      path: `docs/screenshots/compact-mobile-cards-${width}.png`,
      fullPage: false,
      animations: "disabled",
    });
    if (width === 390) {
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    const card = cards.filter({ hasText: name });
    await card.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => scrollY);
    const urlBefore = page.url();
    await card.click();
    await expect(
      dialog.getByRole("heading", { name: "상품 상세", exact: true }),
    ).toBeVisible();
    expect(page.url()).toBe(urlBefore);
    const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(11);
    expect(bounds.y).toBeGreaterThan(20);
    expect(bounds.height).toBeLessThan(844 * 0.9);
    expect(bounds.x + bounds.width).toBeLessThan(width);
    await expect(
      dialog.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("리뷰 제안 담당자", { exact: true }),
    ).toHaveCount(1);
    await expect(
      dialog.getByText("ORDER-MOBILE-001", { exact: true }),
    ).toHaveCount(1);
    await dialog
      .getByText("리뷰 제안 담당자", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      dialog.getByText("리뷰 제안 담당자", { exact: true }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("heading", { name: "상품 상세", exact: true }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "수정", exact: true }),
    ).toBeInViewport();
    await dialog.locator(".detail-body").evaluate((el) => {
      el.scrollTop = 0;
    });
    if (width === 390) {
      await page.screenshot({
        path: "docs/screenshots/compact-mobile-detail.png",
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
      await page.mouse.click(3, 20);
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).toBeHidden();
    await expect(card).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
    expect(page.url()).toBe(urlBefore);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("플랫폼 필터").selectOption("네이버");
  await expect(counts).toHaveText(["1", "1", "0", "0", "0"]);
  await page.getByLabel("플랫폼 필터").selectOption("");
  await page.getByLabel("상품 검색").fill("없는 상품명");
  await expect(counts).toHaveText(["0", "0", "0", "0", "0"]);
  await page.getByLabel("상품 검색").fill("리뷰 제안 담당자");
  await expect(counts).toHaveText(["1", "1", "0", "1", "0"]);
  await tabs.getByRole("tab", { name: "작성 전", exact: true }).click();
  await page.locator(".mobile-product").click();
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await closeDetail();
  await expect(counts).toHaveText(["1", "0", "1", "0", "0"]);
  await expect(
    tabs.getByRole("tab", { name: "리뷰 완료", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.locator(".mobile-product").click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await closeDetail();
  await expect(counts).toHaveText(["1", "0", "1", "0", "1"]);
  await expect(
    tabs.getByRole("tab", { name: "정산 완료", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(counts).toHaveText(["1", "0", "1", "0", "1"]);
  await expect(page.locator(".mobile-product")).toHaveCount(1);
  await page.getByLabel("상품 검색").fill("");
  await expect(counts).toHaveText(["4", "1", "3", "0", "2"]);
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "페이백", exact: true })
    .click();
  await expect(counts).toHaveText(["4", "2", "1", "2"]);
  await expect(
    page.locator(".mobile-product").filter({ hasText: "데일리 핸드크림" }),
  ).toContainText("6,000원");
});
