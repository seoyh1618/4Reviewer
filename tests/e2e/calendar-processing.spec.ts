import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { today } from "../../shared/domain.mjs";

test("calendar uses actual review processing dates and updates after completion, date edits and reversal", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `calendar-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(signup.status()).toBe(201);
  const month = today().slice(0, 7);
  const processed = `${month}-05`;
  const revised = `${month}-07`;
  const deadline = `${month}-20`;
  const [year, number] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, number - 2, 5))
    .toISOString()
    .slice(0, 10);
  const create = async (
    name: string,
    reviewedAt: string,
    dueDate: string,
    reviewStatus = "done",
  ) => {
    const response = await page.request.post("/api/reviews", {
      data: {
        name,
        reviewedAt,
        dueDate,
        reviewStatus,
        purchaseDate: `${month}-01`,
        price: 24900,
        shippingMethod: "빈박스",
        platform: "쿠팡",
        reviewType: "사진 리뷰",
      },
    });
    expect(response.status()).toBe(201);
  };
  await create("처리일 수정할 리뷰", processed, deadline);
  await create("마감 미정 완료 리뷰", processed, "");
  await create("같은 날 완료한 리뷰", processed, deadline);
  await create("지난달 처리한 리뷰", previous, deadline);
  await create("처리일 없는 기존 완료 리뷰", "", deadline);
  await create("오늘 마감인 작성 전 리뷰", "", today(), "todo");

  const day = (date: string, count: number) =>
    page.getByRole("button", {
      name: `${date} 리뷰 처리 ${count}건`,
      exact: true,
    });
  const agenda = page.locator(".agenda-panel");
  const dialog = page.getByRole("dialog");
  const closeDetail = () =>
    dialog
      .locator(".detail-footer")
      .getByRole("button", {
        name: "닫기",
        exact: true,
      })
      .click();

  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/?view=calendar");
    await expect(page.locator(".calendar-heading .count-chip")).toHaveText(
      "처리 3건",
    );
    await day(processed, 3).click();
    await expect(agenda.locator(".agenda-item")).toHaveCount(3);
    await expect(agenda).toContainText("마감 미정 완료 리뷰");
    await expect(agenda).toContainText("3건의 리뷰 처리");
    await expect(page.locator(".calendar-layout")).not.toContainText("작성 전");
    if (width === 1440) await expect(day(processed, 3)).toContainText("+1건");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `docs/screenshots/calendar-processing-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await day(deadline, 0).click();
    await expect(agenda).toContainText("처리한 리뷰가 없어요");
    await page.getByRole("button", { name: "이전 달", exact: true }).click();
    await expect(page.locator(".calendar-heading .count-chip")).toHaveText(
      "처리 1건",
    );
    await day(previous, 1).click();
    await expect(agenda).toContainText("지난달 처리한 리뷰");
    await page.getByRole("button", { name: "오늘", exact: true }).click();
    await expect(page.locator(".calendar-heading .count-chip")).toHaveText(
      "처리 3건",
    );
  }

  // Editing a completed review moves the entry immediately, without changing its deadline.
  await day(processed, 3).click();
  await agenda.getByRole("button", { name: /처리일 수정할 리뷰/ }).click();
  await dialog
    .getByRole("button", { name: "리뷰 정보 수정", exact: true })
    .click();
  await dialog.getByLabel("리뷰 작성일", { exact: true }).fill(revised);
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await closeDetail();
  await expect(day(processed, 2)).toBeVisible();
  await day(revised, 1).click();
  await expect(agenda).toContainText("처리일 수정할 리뷰");

  // Returning to pending removes the processing event.
  await agenda.getByRole("button", { name: /처리일 수정할 리뷰/ }).click();
  await dialog
    .locator(".detail-footer")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await dialog.getByLabel(/^리뷰 상태/).selectOption("todo");
  await dialog
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await closeDetail();
  await expect(day(revised, 0)).toBeVisible();
  await expect(page.locator(".calendar-heading .count-chip")).toHaveText(
    "처리 2건",
  );

  // Deadline shortcuts still lead to pending work, not the completed-review calendar.
  await page.goto("/");
  await page.locator(".attention-banner").click();
  await expect(page).toHaveURL(/view=products&status=urgent/);
  await page.goto("/?view=calendar");
  await page.getByRole("button", { name: /^마감 확인 \d+건$/ }).click();
  await expect(page).toHaveURL(/view=products&status=urgent/);
  await page
    .locator(".mobile-product")
    .filter({ hasText: "오늘 마감인 작성 전 리뷰" })
    .click();
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog.getByLabel("리뷰 작성일", { exact: true }).fill(revised);
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await closeDetail();
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await day(revised, 1).click();
  await expect(agenda).toContainText("오늘 마감인 작성 전 리뷰");
  await expect(page.locator(".calendar-heading .count-chip")).toHaveText(
    "처리 3건",
  );
  await page.reload();
  await day(revised, 1).click();
  await expect(agenda).toContainText("오늘 마감인 작성 전 리뷰");
  const { reviews } = await (await page.request.get("/api/reviews")).json();
  expect(
    reviews.find(
      (r: { name: string }) => r.name === "오늘 마감인 작성 전 리뷰",
    ),
  ).toMatchObject({
    reviewStatus: "done",
    reviewedAt: revised,
    dueDate: today(),
  });
});
