import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { today, dateOffset } from "../../shared/domain.mjs";

test("dashboard lists every pending review by deadline then registration and removes completed reviews", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `pending-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  const create = async (
    name: string,
    dueDate = "",
    purchaseDate = today(),
    done = false,
  ) => {
    const result = await page.request.post("/api/reviews", {
      data: {
        name,
        dueDate,
        purchaseDate,
        price: 24900,
        shippingMethod: "빈박스",
        additionalReviewFee: 3000,
        platform: "쿠팡",
        reviewType: "사진 리뷰",
        reviewStatus: done ? "done" : "todo",
        reviewedAt: done ? today() : "",
      },
    });
    expect(result.status()).toBe(201);
  };
  // Purchase dates intentionally oppose registration order.
  await create("먼저 등록한 마감 미정 리뷰", "", dateOffset(5));
  await create("나중에 등록한 마감 미정 리뷰", "", dateOffset(-10));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const panel = page.locator(".deadline-panel");
  const names = panel.locator(".deadline-row strong");
  await expect(names).toHaveText([
    "먼저 등록한 마감 미정 리뷰",
    "나중에 등록한 마감 미정 리뷰",
  ]);
  await expect(panel.locator(".deadline-text > span")).toContainText([
    "마감 미정",
    "마감 미정",
  ]);
  await expect(page.locator(".attention-banner")).toContainText("리뷰 0건");

  await create("다음 주 마감 리뷰", dateOffset(7));
  await create("먼저 등록한 내일 마감 리뷰", dateOffset(1));
  await create("오늘 마감 리뷰", today());
  await create("마감이 지난 리뷰", dateOffset(-1));
  await create("나중에 등록한 내일 마감 리뷰", dateOffset(1));
  await create("이미 작성한 리뷰", today(), today(), true);
  const ordered = [
    "마감이 지난 리뷰",
    "오늘 마감 리뷰",
    "먼저 등록한 내일 마감 리뷰",
    "나중에 등록한 내일 마감 리뷰",
    "다음 주 마감 리뷰",
    "먼저 등록한 마감 미정 리뷰",
    "나중에 등록한 마감 미정 리뷰",
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(names).toHaveText(ordered);
    await expect(panel.locator(".count-chip")).toHaveText("7");
    await expect(page.locator(".attention-banner")).toContainText("리뷰 4건");
    expect(
      await panel
        .locator(".deadline-items")
        .evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 100),
    );
    await panel.screenshot({
      path: `docs/screenshots/dashboard-pending-${width}.png`,
      animations: "disabled",
    });
    await panel.locator(".deadline-items").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await panel.screenshot({
      path: `docs/screenshots/dashboard-pending-undated-${width}.png`,
      animations: "disabled",
    });
    await panel
      .getByRole("button", { name: /나중에 등록한 마감 미정 리뷰/ })
      .click();
    const detail = page.locator(".review-detail-modal");
    await expect(
      detail.getByRole("heading", {
        name: "나중에 등록한 마감 미정 리뷰",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "리뷰 완료", exact: true }),
    ).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await detail
      .locator(".detail-footer")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include(".deadline-panel")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await panel
    .getByRole("button", { name: "작성 전 리뷰 전체 보기", exact: true })
    .click();
  await expect(page).toHaveURL(/view=products&status=todo/);
  await expect(page.locator(".mobile-product")).toHaveCount(7);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=products");
  for (const label of ["리뷰 완료", "정산 완료 전환"]) {
    await expect(
      page
        .locator(".product-data-table")
        .getByRole("button", { name: label, exact: true })
        .first(),
    ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  }

  await page.goto("/");
  await panel
    .getByRole("button", { name: /먼저 등록한 마감 미정 리뷰/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "정산 완료", exact: true }),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(names).toHaveText(
    ordered.filter((name) => name !== "먼저 등록한 마감 미정 리뷰"),
  );
  await expect(panel.locator(".count-chip")).toHaveText("6");

  const { reviews } = await (await page.request.get("/api/reviews")).json();
  for (const item of reviews.filter(
    (r: { reviewStatus: string }) => r.reviewStatus === "todo",
  )) {
    const saved = await page.request.put(`/api/reviews/${item.id}`, {
      data: { ...item, reviewStatus: "done", reviewedAt: today() },
    });
    expect(saved.ok()).toBe(true);
  }
  await page.reload();
  await expect(names).toHaveCount(0);
  await expect(panel.locator(".count-chip")).toHaveText("0");
  await expect(
    panel.getByText("작성할 리뷰가 없어요", { exact: true }),
  ).toBeVisible();
});
