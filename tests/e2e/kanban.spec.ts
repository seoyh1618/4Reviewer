import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { today, dateOffset } from "../../shared/domain.mjs";

test.use({ actionTimeout: 15000 });

test("review kanban preserves filters and layout and moves cards only after review/payment saves", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signup = await page.request.post("/api/auth/signup", {
    data: {
      email: `kanban-${randomUUID()}@example.test`,
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
        seller: "공식 브랜드 스토어",
        platform: "쿠팡",
        price: 10000,
        shippingMethod: "빈박스",
        purchaseDate: today(),
        reviewType: "사진 리뷰",
        reviewStatus: "todo",
        ...overrides,
      },
    });
    expect(response.status()).toBe(201);
  };
  await create("라운드랩 1025 독도 토너 200ml", { dueDate: today() });
  await create("오설록 달빛걷기 티백 20입", {
    dueDate: dateOffset(2),
    platform: "네이버",
    price: 15600,
  });
  await create(
    "한 줄을 넘는 긴 상품명과 옵션 · 데일리 에코백 내추럴 2개 세트",
    { price: 12900 },
  );
  await create("먼저 입금받은 작성 전 리뷰", {
    receivedAmount: 10000,
    paidAt: today(),
  });
  await create("무아스 무소음 미니 탁상시계", {
    reviewStatus: "done",
    reviewedAt: today(),
  });
  await create("아로마티카 로즈마리 스칼프 샴푸", {
    reviewStatus: "done",
    reviewedAt: today(),
    receivedAmount: 5000,
    paidAt: today(),
  });
  await create("리뷰비 없는 실배송 상품", {
    reviewStatus: "done",
    reviewedAt: today(),
    shippingMethod: "실배송",
  });
  await create("락앤락 메트로 텀블러 475ml", {
    reviewStatus: "done",
    reviewedAt: today(),
    receivedAmount: 10000,
    paidAt: today(),
  });
  await create("포트메리온 보타닉 머그 2P", {
    reviewStatus: "done",
    reviewedAt: today(),
    receivedAmount: 10000,
    paidAt: today(),
    platform: "11번가",
  });
  for (let n = 1; n <= 13; n++)
    await create(`지난 리뷰 ${String(n).padStart(2, "0")}`, {
      reviewStatus: "done",
      reviewedAt: dateOffset(-n),
      receivedAmount: 10000,
      paidAt: dateOffset(-n),
      purchaseDate: dateOffset(-n - 1),
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=products");
  await expect(page.locator(".product-data-table tbody tr")).toHaveCount(20);
  await page
    .getByRole("button", { name: "칸반뷰로 보기", exact: true })
    .click();
  const board = page.getByRole("region", {
    name: "리뷰 칸반 보드",
    exact: true,
  });
  const lane = (label: string) =>
    page.getByRole("region", { name: `${label} 카드 목록`, exact: true });
  const card = (name: string) =>
    board.locator(".kanban-card").filter({
      has: page.getByRole("button", { name: `${name} 상세`, exact: true }),
    });
  const dialog = page.getByRole("dialog");
  await expect(board.locator(".kanban-card")).toHaveCount(22);
  await expect(board.locator(".kanban-count")).toHaveText(["4", "3", "15"]);
  await expect(lane("작성 전")).toContainText("먼저 입금받은 작성 전 리뷰");
  await expect(lane("리뷰 완료")).toContainText("리뷰비 없는 실배송 상품");
  await expect(card("리뷰비 없는 실배송 상품")).toContainText("정산 없음");
  await expect(card("아로마티카 로즈마리 스칼프 샴푸")).toContainText(
    "부분 입금 · 5,000원",
  );
  await expect(
    page.getByRole("button", { name: "표시할 열", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".pagination")).toHaveCount(0);
  await page.reload();
  await expect(board).toBeVisible();
  await page.getByLabel("플랫폼 필터").selectOption("네이버");
  await expect(board.locator(".kanban-card")).toHaveCount(1);
  await expect(board.locator(".kanban-count")).toHaveText(["1", "0", "0"]);
  await expect(page.locator(".review-kpis dd")).toHaveText([
    "1건",
    "0건",
    "1건",
    "0건",
    "15,600원",
  ]);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain("오설록 달빛걷기 티백 20입");
  expect(csv).not.toContain("라운드랩");
  await page
    .getByRole("button", { name: "테이블뷰로 보기", exact: true })
    .click();
  await expect(page.locator(".product-data-table tbody tr")).toHaveCount(1);
  await expect(page.getByLabel("플랫폼 필터")).toHaveValue("네이버");
  await page
    .getByRole("button", { name: "칸반뷰로 보기", exact: true })
    .click();
  await page.getByLabel("플랫폼 필터").selectOption("");
  await page.getByLabel("리뷰 타입 필터").selectOption("실배송");
  await expect(board.locator(".kanban-count")).toHaveText(["0", "1", "0"]);
  await page.getByLabel("상품 검색").fill("검색 결과 없음");
  await expect(
    page.getByText("검색 결과가 없어요", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await expect(board.locator(".kanban-card")).toHaveCount(22);
  await page.getByRole("tab", { name: "마감 임박", exact: true }).click();
  await expect(board.locator(".kanban-count")).toHaveText(["2", "0", "0"]);
  await page.getByRole("tab", { name: "전체 상품", exact: true }).click();
  await page.getByLabel("정렬", { exact: true }).selectOption("price");
  await expect(lane("작성 전").locator(".kanban-card-name").first()).toHaveText(
    "오설록 달빛걷기 티백 20입",
  );
  await page.getByLabel("정렬", { exact: true }).selectOption("recent");

  for (const width of [1440, 768, 600, 390, 360, 320]) {
    await page.setViewportSize({ width, height: width <= 768 ? 844 : 1000 });
    if (width <= 600) {
      await expect(page.locator(".review-view-toggle")).toHaveCount(0);
      await expect(board).toHaveCount(0);
      await expect(page.locator(".mobile-product")).toHaveCount(20);
      await page.reload();
      await expect(board).toHaveCount(0);
      await expect(page.locator(".review-view-toggle")).toHaveCount(0);
      await expect(page.locator(".mobile-product")).toHaveCount(20);
      const exportButton = page.getByRole("button", {
        name: "내보내기",
        exact: true,
      });
      const addButton = page.getByRole("button", {
        name: "상품 등록",
        exact: true,
      });
      expect((await addButton.boundingBox())!.y).toBe(
        (await exportButton.boundingBox())!.y,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390) {
        await page.screenshot({
          path: "docs/screenshots/mobile-without-kanban.png",
          animations: "disabled",
        });
      }
      await page.locator(".mobile-product").first().click();
      await expect(dialog).toBeVisible();
      await dialog
        .locator(".detail-footer")
        .getByRole("button", { name: "닫기", exact: true })
        .click();
      continue;
    }
    await expect(board).toBeVisible();
    await board.evaluate((el) => {
      el.scrollLeft = 0;
      el.querySelectorAll(".kanban-lane").forEach((lane) => {
        lane.scrollTop = 0;
      });
    });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      return document.fonts.ready;
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const exportBox = (await page
      .getByRole("button", { name: "내보내기", exact: true })
      .boundingBox())!;
    const toggleBox = (await page
      .getByRole("button", { name: "테이블뷰로 보기", exact: true })
      .boundingBox())!;
    expect(toggleBox.y).toBe(exportBox.y);
    expect(toggleBox.x).toBeGreaterThan(exportBox.x);
    await page.screenshot({
      path: `docs/screenshots/review-kanban-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    if (width <= 768) {
      await board.evaluate((el) =>
        window.scrollBy(0, el.getBoundingClientRect().top - 82),
      );
      await page.screenshot({
        path: `docs/screenshots/review-kanban-board-${width}.png`,
        animations: "disabled",
      });
    }
    await board
      .getByRole("button", {
        name: "라운드랩 1025 독도 토너 200ml 상세",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("heading", {
        name: "라운드랩 1025 독도 토너 200ml",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/view=products/);
    await dialog
      .locator(".detail-footer")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    if (width <= 768) {
      await board.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await lane("정산 완료")
        .getByRole("button", {
          name: "락앤락 메트로 텀블러 475ml 상세",
          exact: true,
        })
        .click();
      await expect(
        dialog.getByRole("heading", {
          name: "락앤락 메트로 텀블러 475ml",
          exact: true,
        }),
      ).toBeVisible();
      await dialog
        .locator(".detail-footer")
        .getByRole("button", { name: "닫기", exact: true })
        .click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(board).toBeVisible();
  await expect(
    page.getByRole("button", { name: "테이블뷰로 보기", exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include(".review-kanban")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const target = card("라운드랩 1025 독도 토너 200ml");
  await target.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(board.locator(".kanban-count")).toHaveText(["4", "3", "15"]);
  await target.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(lane("리뷰 완료")).toContainText(
    "라운드랩 1025 독도 토너 200ml",
  );
  await expect(board.locator(".kanban-count")).toHaveText(["3", "4", "15"]);
  await expect(page.locator(".review-kpis dd").nth(2)).toHaveText("3건");
  await target
    .getByRole("button", { name: "정산 완료 전환", exact: true })
    .click();
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("4000");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(target).toContainText("부분 입금 · 6,000원");
  await expect(board.locator(".kanban-count")).toHaveText(["3", "4", "15"]);
  await target
    .getByRole("button", { name: "정산 완료 전환", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await expect(lane("정산 완료")).toContainText(
    "라운드랩 1025 독도 토너 200ml",
  );
  await expect(board.locator(".kanban-count")).toHaveText(["3", "3", "16"]);
  await expect(
    target.getByRole("button", { name: "정산 완료 전환", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(board.locator(".kanban-count")).toHaveText(["3", "3", "16"]);
  await page
    .getByRole("button", { name: "테이블뷰로 보기", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".product-data-table tbody tr")).toHaveCount(20);
  expect(errors).toEqual([]);
});
