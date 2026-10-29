import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
test.describe("mobile review form and sorting", () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.request.post("/api/auth/signup", {
      data: {
        username: "mobile_" + randomUUID().replaceAll("-", "").slice(0, 20),
        password: "Pass1234",
        signupCode: "3333",
      },
    });
    expect(res.status()).toBe(201);
  });
  test("registration and editing fit narrow/short viewports with reachable fields and actions", async ({
    page,
  }, testInfo) => {
    const engine = testInfo.project.name;
    await page.goto("/?view=products");
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("상품명")
      .fill("좁은 화면에서 확인하는 긴 상품명 " + "상품".repeat(50));
    await dialog.getByLabel("구매 플랫폼").selectOption("기타");
    await dialog.getByLabel("기타 플랫폼 이름").fill("긴플랫폼이름".repeat(10));
    await dialog
      .getByLabel("판매처", { exact: true })
      .fill("LONGSELLER".repeat(10));
    await dialog.getByLabel("구매일").fill("2026-10-29");
    await dialog.getByLabel("리뷰 마감일", { exact: true }).fill("");
    await dialog.getByLabel("구매금액").fill("999999999");
    await dialog.getByLabel("리뷰비", { exact: true }).fill("1");
    await dialog
      .getByRole("button", { name: "추가 관리 정보 · SKU, 주문번호" })
      .click();
    await dialog
      .getByLabel("주문번호", { exact: true })
      .fill("ORDER".repeat(20));
    await dialog.getByLabel("SKU", { exact: true }).fill("SKU".repeat(25));
    // Reject an unsupported upload without starting OCR; the error must wrap as well.
    await page.getByLabel("주문내역 이미지 업로드").setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid"),
    });
    await expect(dialog.getByRole("alert")).toContainText("10MB");
    for (const [width, height] of [
      [320, 568],
      [360, 640],
      [390, 844],
      [430, 932],
      [390, 400],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await dialog
        .getByRole("textbox", { name: "메모", exact: true })
        .fill("메모 ".repeat(200));
      await expect(
        dialog.getByRole("button", { name: "상품 등록하기", exact: true }),
      ).toBeInViewport();
      await expect(
        dialog.getByRole("heading", { name: "새 상품 등록" }),
      ).toBeInViewport();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(
        await dialog
          .locator(".form-body")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const fields = await dialog
        .locator("input:not([type=file]),select,textarea")
        .evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.left, right: r.right };
          }),
        );
      expect(fields.every((r) => r.x >= 0 && r.right <= width + 1)).toBe(true);
      for (const select of await dialog.locator("select").all()) {
        expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await dialog.getByLabel("구매일").focus();
      await expect(dialog.getByLabel("구매일")).toBeInViewport();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.getByLabel("상품명").fill("모바일 등록 검증");
    await dialog.getByLabel("기타 플랫폼 이름").fill("테스트 마켓");
    await dialog.getByLabel("판매처", { exact: true }).fill("테스트 판매처");
    await dialog
      .getByLabel("리뷰 타입", { exact: true })
      .selectOption("빈박스");
    await dialog.locator(".form-body").evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: `docs/screenshots/mobile-form-${engine}.png`,
      animations: "disabled",
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    await dialog
      .getByRole("button", { name: "상품 등록하기", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(".mobile-product")).toContainText(
      "모바일 등록 검증",
    );
    const state = await (await page.request.get("/api/reviews")).json();
    expect(state.reviews[0]).toMatchObject({
      name: "모바일 등록 검증",
      price: 999999999,
      additionalReviewFee: 1,
      platformOther: "테스트 마켓",
      dueDate: "",
    });
    await page.locator(".mobile-product").click();
    await dialog.getByRole("button", { name: "수정", exact: true }).click();
    await expect(
      dialog.getByRole("heading", { name: "상품 정보 수정" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 568 });
    await dialog.getByLabel("정산일", { exact: true }).focus();
    expect(
      await dialog
        .locator(".form-body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(
      dialog.getByRole("button", { name: "변경사항 저장", exact: true }),
    ).toBeInViewport();
  });
  test("column taps sort the whole list before paging and persist across reloads, export and views", async ({
    page,
  }, testInfo) => {
    const engine = testInfo.project.name;
    for (let n = 0; n < 23; n++) {
      const response = await page.request.post("/api/reviews", {
        data: {
          name: `상품 ${n + 1}`,
          price: (n + 1) * 1000,
          purchaseDate: `2026-10-${String(n + 1).padStart(2, "0")}`,
          platform: n === 0 ? "네이버" : "쿠팡",
          shippingMethod: n === 0 ? "빈박스" : "실배송",
          reviewType: "사진 리뷰",
          reviewStatus: "todo",
          additionalReviewFee: n + 1,
        },
      });
      expect(response.status()).toBe(201);
    }
    await page.goto("/?view=products");
    const sort = page.getByRole("group", { name: "정렬할 열", exact: true });
    const titles = page.locator(".mobile-card-title strong");
    for (const width of [320, 360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.getByLabel("플랫폼 필터")).toBeHidden();
      await expect(page.getByLabel("리뷰 타입 필터")).toBeHidden();
      await expect(page.getByLabel("정렬", { exact: true })).toBeHidden();
      await expect(sort).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await sort.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await expect(titles.first()).toHaveText("상품 23");
    await page
      .getByRole("button", { name: "다음 페이지", exact: true })
      .click();
    await sort
      .getByRole("button", { name: "상품명 정렬", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "이전 페이지", exact: true }),
    ).toBeDisabled();
    await expect(titles.first()).toHaveText("상품 1");
    await expect(titles.nth(1)).toHaveText("상품 2");
    await sort
      .getByRole("button", { name: "상품명 정렬", exact: true })
      .click();
    await expect(titles.first()).toHaveText("상품 23");
    await sort
      .getByRole("button", { name: "구매가 정렬", exact: true })
      .click();
    await expect(titles.first()).toHaveText("상품 23");
    await sort
      .getByRole("button", { name: "구매가 정렬", exact: true })
      .click();
    await expect(titles.first()).toHaveText("상품 1");
    await page.reload();
    await expect(titles.first()).toHaveText("상품 1");
    await expect(
      sort.getByRole("button", { name: "구매가 정렬" }),
    ).toHaveAttribute("aria-pressed", "true");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "내보내기", exact: true }).click();
    const csv = await readFile((await (await downloadPromise).path())!, "utf8");
    expect(csv.indexOf('"상품 1"')).toBeLessThan(csv.indexOf('"상품 23"'));
    await sort
      .getByRole("button", { name: "플랫폼 정렬", exact: true })
      .click();
    await expect(titles.first()).toHaveText("상품 1");
    await sort
      .getByRole("button", { name: "리뷰 타입 정렬", exact: true })
      .click();
    await expect(titles.first()).toHaveText("상품 1");
    await sort
      .getByRole("button", { name: "리뷰 타입 정렬", exact: true })
      .click();
    await expect(titles.first()).not.toHaveText("상품 1");
    await sort
      .getByRole("button", { name: "구매일 정렬", exact: true })
      .click();
    await expect(titles.first()).toHaveText("상품 23");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `docs/screenshots/mobile-sort-${engine}.png`,
      animations: "disabled",
    });
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    const before = page.url();
    await page.locator(".mobile-product").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(page.url()).toBe(before);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "닫기", exact: true })
      .last()
      .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole("columnheader", { name: "구매가", exact: true })
      .getByRole("button")
      .click();
    await expect(
      page.getByRole("columnheader", { name: "구매가", exact: true }),
    ).toHaveAttribute("aria-sort", "descending");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?view=products&platform=" + encodeURIComponent("네이버"));
    await expect(page.locator(".mobile-product")).toHaveCount(1);
    await page.getByRole("button", { name: "플랫폼 네이버 선택 해제" }).click();
    await expect(page.locator(".mobile-product")).toHaveCount(20);
    await page.goto("/?view=payback");
    await sort.getByRole("button", { name: "남은 금액 정렬" }).click();
    await expect(titles.first()).toHaveText("상품 1");
    await sort.getByRole("button", { name: "남은 금액 정렬" }).click();
    await expect(titles.first()).toHaveText("상품 2");
  });
});
