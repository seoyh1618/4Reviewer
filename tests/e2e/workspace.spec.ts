import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { dateOffset, today } from "../../shared/domain.mjs";
import { sampleReviews } from "../fixtures/reviews.mjs";

test.use({ actionTimeout: 15000 });

async function seedWorkspace(page: Page, withSamples = true) {
  const auth = await page.request.post("/api/auth/signup", {
    data: {
      email: `test-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(auth.status()).toBe(201);
  for (const item of withSamples ? sampleReviews() : []) {
    const response = await page.request.post("/api/reviews", { data: item });
    expect(response.status()).toBe(201);
  }
  await page.goto("/");
}

test("real signup, create, edit, review, partial payment, full payment, export and delete", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  const email = `reviewer-${Date.now()}@example.test`;
  await expect(page.getByLabel("이름", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "예시 데이터로 둘러보기" }),
  ).toHaveCount(0);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill("ReviewPass-1234");
  await page.getByLabel("회원가입 코드", { exact: true }).fill("3333");
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  await expect(page.getByText("등록된 상품이 없습니다")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "받을 페이백", exact: true })
      .locator(".metric-value"),
  ).toHaveText("0원");
  await expect(
    page
      .getByRole("region", { name: "작성해야 할 리뷰", exact: true })
      .locator(".metric-value"),
  ).toHaveText("0건");
  await expect(page.locator(".page-title p")).toHaveText(
    "작성할 리뷰와 받을 페이백을 한눈에 확인하세요.",
  );
  await page.screenshot({
    path: "docs/screenshots/dashboard-empty.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("상품명").fill("브라우저 검증 텀블러");
  await expect(dialog.getByLabel("구매 플랫폼").locator("option")).toHaveText([
    "쿠팡",
    "네이버",
    "11번가",
    "2마켓",
    "SSG닷컴",
    "무신사",
    "오늘의집",
    "올리브영",
    "컬리",
    "기타",
  ]);
  await expect(dialog.getByLabel("리뷰 타입").locator("option")).toHaveText([
    "실배송",
    "빈박스",
  ]);
  await expect(dialog.getByText(/추가\s?비용/)).toHaveCount(0);
  await dialog.getByLabel("구매 플랫폼").selectOption("기타");
  await dialog.getByLabel("기타 플랫폼 이름").fill("G마켓");
  await dialog.getByLabel("리뷰 타입").selectOption("빈박스");
  await dialog.getByLabel("판매처", { exact: true }).fill("리빙 스튜디오");
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("24900");
  await dialog.getByLabel("리뷰 마감일").fill("2026-10-30");
  await dialog.getByRole("button", { name: "상품 등록하기" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: /브라우저 검증 텀블러/ })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("G마켓", { exact: true })).toBeVisible();
  await expect(dialog.getByText("빈박스", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "리뷰 완료 입력", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(
    dialog.locator(".inline-badges").getByText("리뷰 완료", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog
      .locator(".detail-fields div")
      .filter({ has: page.locator("dt", { hasText: "리뷰 작성일" }) })
      .locator("dd"),
  ).toHaveText(today().replaceAll("-", ". "));
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog.getByLabel("이번 입금액").fill("10000");
  await dialog.getByLabel("입금일", { exact: true }).fill("2026-10-28");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(dialog.getByText("부분 입금", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click();
  await expect(dialog.getByText("입금 완료", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByRole("dialog").getByLabel("상품명").fill("수정된 텀블러");
  await expect(dialog.getByLabel("기타 플랫폼 이름")).toHaveValue("G마켓");
  await expect(dialog.getByLabel("리뷰 타입")).toHaveValue("빈박스");
  await dialog.getByLabel("구매 플랫폼").selectOption("11번가");
  await expect(dialog.getByLabel("기타 플랫폼 이름")).toHaveCount(0);
  await dialog.getByLabel("구매 플랫폼").selectOption("기타");
  await expect(dialog.getByLabel("기타 플랫폼 이름")).toHaveValue("");
  await dialog.getByLabel("기타 플랫폼 이름").fill("G마켓");
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "수정된 텀블러" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await page.reload();
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: "내 리뷰" })
    .click();
  await expect(
    page.getByRole("button", { name: /수정된 텀블러/ }).first(),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("For-Reviewer");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("G마켓");
  expect(csv).toContain("리뷰 타입");
  expect(csv).toContain("빈박스");
  expect(csv).not.toMatch(/추가\s?비용/);
  await page.getByRole("textbox", { name: "상품 검색" }).fill("G마켓");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: "통계", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "플랫폼별 주문", exact: true })
      .getByText("G마켓", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("heading", { name: "SIGN IN" })).toBeVisible();
  await page.getByLabel("로그인 계정", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill("ReviewPass-1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /수정된 텀블러/ })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "상품 삭제 요청" }).click();
  await dialog.getByRole("button", { name: "상품 삭제", exact: true }).click();
  await expect(page.getByText("등록된 상품이 없습니다")).toBeVisible();
  expect(errors).toEqual([]);
});

test("product status filters keep review completion independent from settlement on desktop and mobile", async ({
  page,
}) => {
  await seedWorkspace(page, false);
  const cases = [
    { name: "작성 전 미입금", reviewStatus: "todo", receivedAmount: 0 },
    {
      name: "마감 임박 미입금",
      reviewStatus: "todo",
      receivedAmount: 0,
      dueDate: dateOffset(1),
    },
    {
      name: "리뷰 완료 미입금",
      reviewStatus: "done",
      receivedAmount: 0,
      dueDate: dateOffset(1),
    },
    { name: "리뷰 완료 부분 입금", reviewStatus: "done", receivedAmount: 4000 },
    {
      name: "리뷰 완료 전액 입금",
      reviewStatus: "done",
      receivedAmount: 10000,
    },
    { name: "작성 전 전액 입금", reviewStatus: "todo", receivedAmount: 10000 },
    {
      name: "리뷰 완료 정산 없음",
      reviewStatus: "done",
      receivedAmount: 0,
      expectedPayback: 0,
      paybackMode: "custom",
      shippingMethod: "실배송",
    },
  ];
  for (const item of cases) {
    const response = await page.request.post("/api/reviews", {
      data: {
        platform: "쿠팡",
        shippingMethod: "빈박스",
        price: 10000,
        expectedPayback: 10000,
        purchaseDate: today(),
        dueDate: dateOffset(7),
        reviewType: "사진 리뷰",
        reviewedAt: item.reviewStatus === "done" ? today() : "",
        paidAt: item.receivedAmount > 0 ? today() : "",
        ...item,
      },
    });
    expect(response.status()).toBe(201);
  }
  for (const width of [1440, 360, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/?view=products");
    const tabs = page.getByRole("tablist", { name: "상품 진행 상태" });
    await expect(tabs.getByRole("tab")).toHaveText([
      "전체 상품7",
      "작성 전3",
      "리뷰 완료4",
      "마감 임박1",
      "정산 완료2",
    ]);
    for (const [label, names] of [
      ["작성 전", ["작성 전 미입금", "마감 임박 미입금", "작성 전 전액 입금"]],
      [
        "리뷰 완료",
        [
          "리뷰 완료 미입금",
          "리뷰 완료 부분 입금",
          "리뷰 완료 전액 입금",
          "리뷰 완료 정산 없음",
        ],
      ],
      ["마감 임박", ["마감 임박 미입금"]],
      ["정산 완료", ["리뷰 완료 전액 입금", "작성 전 전액 입금"]],
    ] as const) {
      const tab = tabs.getByRole("tab", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      const rows = page.locator(
        width === 1440 ? "tbody tr" : ".mobile-product",
      );
      await expect(rows).toHaveCount(names.length);
      for (const name of names) {
        await expect(rows.filter({ hasText: name })).toHaveCount(1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.reload();
    await expect(
      tabs.getByRole("tab", { name: "정산 완료", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const rows = page.locator(width === 1440 ? "tbody tr" : ".mobile-product");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "작성 전 전액 입금" })).toContainText(
      "작성 전",
    );
    await page.screenshot({
      path: `docs/screenshots/product-status-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("mobile 360/390 and tablet 768: navigation, filters, calendar, registration and layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await seedWorkspace(page);
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/mobile-dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of [
      "내 리뷰",
      "템플릿",
      "페이백",
      "캘린더",
      "통계",
      "대시보드",
    ]) {
      await page
        .getByRole("navigation", { name: "모바일 메뉴" })
        .getByRole("button", { name: label, exact: true })
        .click();
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".page-title p")).toBeVisible();
      if (label === "대시보드") {
        await expect(
          page
            .getByRole("region", { name: "받을 페이백", exact: true })
            .locator(".metric-value"),
        ).toHaveText("131,500원");
        await expect(
          page
            .getByRole("region", { name: "작성해야 할 리뷰", exact: true })
            .locator(".metric-value"),
        ).toHaveText("6건");
      }
      const layout = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll("body *")]
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.right > innerWidth &&
              !el.closest(".table-wrap")
            );
          })
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            right: el.getBoundingClientRect().right,
          }))
          .slice(0, 15),
      }));
      expect(
        layout.scrollWidth,
        JSON.stringify({ label, ...layout }),
      ).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "내 리뷰", exact: true })
    .click();
  await page.getByRole("textbox", { name: "상품 검색" }).fill("라운드랩 1025");
  await expect(page.locator(".mobile-product")).toHaveCount(1);
  await page.getByLabel("플랫폼 필터").selectOption("네이버");
  await expect(page.getByText("검색 결과가 없어요")).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화" }).click();
  await expect(page.locator(".mobile-product")).toHaveCount(20);
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("상품명").fill("모바일 등록 상품");
  await dialog.getByLabel("구매 플랫폼").selectOption("기타");
  await dialog.getByLabel("기타 플랫폼 이름").fill("옥션");
  await dialog.getByLabel("리뷰 타입").selectOption("빈박스");
  await dialog
    .getByLabel("카톡 이름", { exact: true })
    .fill("모바일 오퍼 담당자");
  await expect(
    dialog.getByLabel("카톡 이름", { exact: true }),
  ).toHaveAccessibleDescription(
    "카카오톡에서 실제로 리뷰 제안(오퍼)을 보낸 상대방의 카톡 이름을 입력해 주세요.",
  );
  await expect(dialog.getByLabel("리뷰 마감일", { exact: true })).toHaveValue(
    "",
  );
  for (const name of [
    /실제 누적 입금액/,
    /정산일/,
    /입금자명/,
    /리뷰 상태/,
    /리뷰 작성일/,
  ]) {
    await expect(dialog.getByLabel(name)).toHaveCount(0);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/mobile-registration.png",
    fullPage: false,
    animations: "disabled",
  });
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("12000");
  await dialog.getByRole("button", { name: "상품 등록하기" }).click();
  await expect(dialog).not.toBeVisible();
  const mobileCreated = (
    await (await page.request.get("/api/reviews")).json()
  ).reviews.find((item: { name: string }) => item.name === "모바일 등록 상품");
  expect(mobileCreated).toMatchObject({
    kakaoName: "모바일 오퍼 담당자",
    dueDate: "",
    reviewStatus: "todo",
    reviewedAt: "",
    receivedAmount: 0,
    paidAt: "",
    depositor: "",
  });
  await page
    .getByRole("textbox", { name: "상품 검색" })
    .fill("모바일 등록 상품");
  await page.locator(".mobile-product").click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "모바일 등록 상품" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await page
    .getByRole("navigation", { name: "모바일 메뉴" })
    .getByRole("button", { name: "캘린더", exact: true })
    .click();
  await page.getByRole("button", { name: "다음 달" }).click();
  await expect(
    page.getByRole("heading", { name: /2026년 11월/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "오늘", exact: true }).click();
});

test("real local Korean OCR fills amount/date/seller, supports name correction before saving", async ({
  page,
}) => {
  await page.goto("/");
  await seedWorkspace(page);
  await expect(page.locator("h1")).toHaveText("리뷰 대시보드");
  const external: string[] = [];
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && !r.url().includes("127.0.0.1:3188"))
      external.push(r.url());
  });
  await page.evaluate(() => document.fonts.ready);
  const receipt = await page.evaluate(async () => {
    await document.fonts.load(
      '32px "Pretendard Variable"',
      "쿠팡 주문내역 상품명 데일리 텀블러 판매처 리빙 스토어 주문번호 주문일 총 결제금액 원",
    );
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 750;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#000";
    x.font = '32px "Pretendard Variable", sans-serif';
    [
      "쿠팡 주문내역",
      "상품명: 데일리 텀블러",
      "판매처: 리빙 스토어",
      "주문번호: ORDER-7824",
      "주문일: 2026. 10. 28.",
      "총 결제금액: 24,900원",
    ].forEach((s, i) => x.fillText(s, 50, 80 + i * 95));
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByRole("button", { name: "주문내역 가져오기", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("리뷰비", { exact: true })
    .fill("1500");
  await page.getByLabel("주문내역 이미지 업로드").setInputFiles({
    name: "sample-order.png",
    mimeType: "image/png",
    buffer: Buffer.from(receipt, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "다시 적용", exact: true }),
  ).toBeVisible({ timeout: 100000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("상품명")).toHaveValue(/^데일리/);
  await dialog.getByLabel("상품명").fill("데일리 텀블러");
  await expect(
    dialog.getByRole("spinbutton", { name: /^구매금액/ }),
  ).toHaveValue("24900");
  await expect(dialog.getByLabel("구매일", { exact: false })).toHaveValue(
    "2026-10-28",
  );
  await expect(dialog.getByLabel("판매처", { exact: true })).toHaveValue(
    "리빙 스토어",
  );
  expect(external).toEqual([]);
  await page.screenshot({
    path: "docs/screenshots/ocr-form.png",
    fullPage: true,
    animations: "disabled",
  });
  await expect(dialog.getByLabel("예상 페이백", { exact: true })).toHaveCount(
    0,
  );
  await expect(dialog.getByLabel("리뷰비", { exact: true })).toHaveValue(
    "1500",
  );
  await dialog.getByRole("button", { name: "상품 등록하기" }).click();
  await expect(dialog).not.toBeVisible();
  const registeredOrder = (
    await (await page.request.get("/api/reviews")).json()
  ).reviews.find((r: { name: string }) => r.name === "데일리 텀블러");
  expect(registeredOrder).toMatchObject({
    price: 24900,
    expectedPayback: 0,
    paybackMode: "shipping",
    additionalReviewFee: 1500,
    receivedAmount: 0,
  });
});

test("reference login and desktop screenshots, keyboard modal close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SIGN IN" })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/login.png",
    fullPage: true,
    animations: "disabled",
  });
  await seedWorkspace(page);
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: "내 리뷰" })
    .click();
  await page.screenshot({
    path: "docs/screenshots/products-white.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.locator(".product-table-scroll").evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await page.screenshot({
    path: "docs/screenshots/products-settlement.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("구매 플랫폼").selectOption("11번가");
  await page.screenshot({
    path: "docs/screenshots/registration-white.png",
    animations: "disabled",
  });
  await expect(page.getByLabel("리뷰 타입", { exact: true })).toHaveValue(
    "실배송",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("spreadsheet fields persist through registration, editing, table, mobile detail and export", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedWorkspace(page, false);
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  const dashboardAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(dashboardAccessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page
      .getByRole("region", { name: "받을 페이백", exact: true })
      .locator(".metric-value"),
  ).toHaveText("0원");
  await expect(
    page
      .getByRole("region", { name: "작성해야 할 리뷰", exact: true })
      .locator(".metric-value"),
  ).toHaveText("0건");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("상품명").fill("엑셀 항목 검증 상품");
  await dialog.getByLabel("리뷰 타입", { exact: true }).selectOption("빈박스");
  await dialog
    .getByLabel("계정주 (구매 계정)", { exact: true })
    .fill("테스트 계정주");
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("30000");
  for (const name of [
    /실제 누적 입금액/,
    /정산일/,
    /입금자명/,
    /리뷰 상태/,
    /리뷰 작성일/,
  ]) {
    await expect(dialog.getByLabel(name)).toHaveCount(0);
  }
  await expect(dialog.getByLabel("리뷰 마감일", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByLabel("리뷰 마감일", { exact: true }),
  ).toHaveAccessibleDescription(
    "리뷰 마감일이 정해지지 않았다면 비워 두셔도 됩니다.",
  );
  await expect(
    dialog.getByLabel("리뷰 마감일", { exact: true }),
  ).not.toHaveAttribute("required");
  await dialog.getByLabel("연락처", { exact: true }).fill("review_contact");
  await dialog.getByLabel("카톡 이름", { exact: true }).fill("리뷰 담당자");
  await expect(
    dialog.getByLabel("카톡 이름", { exact: true }),
  ).toHaveAccessibleDescription(
    "카카오톡에서 실제로 리뷰 제안(오퍼)을 보낸 상대방의 카톡 이름을 입력해 주세요.",
  );
  await expect(dialog.locator(".settlement-preview")).toHaveCount(0);
  await page.screenshot({
    path: "docs/screenshots/registration-simplified.png",
    fullPage: false,
    animations: "disabled",
  });
  const formAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(formAccessibility.violations).toEqual([]);
  await dialog.getByRole("button", { name: "상품 등록하기" }).click();
  await expect(dialog).not.toBeVisible();
  const created = await (await page.request.get("/api/reviews")).json();
  expect(created.reviews[0]).toMatchObject({
    reviewStatus: "todo",
    reviewedAt: "",
    dueDate: "",
    receivedAmount: 0,
    paidAt: "",
    depositor: "",
    expectedPayback: 30000,
    kakaoName: "리뷰 담당자",
    contact: "review_contact",
  });
  expect(created.payments).toHaveLength(0);
  await page
    .getByRole("button", { name: /엑셀 항목 검증 상품/ })
    .first()
    .click();
  await expect(dialog.getByText("미정", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog.getByLabel("리뷰 작성일", { exact: true }).fill("2026-10-26");
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await dialog.getByRole("button", { name: "정산 완료", exact: true }).click();
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("12000");
  await dialog.getByLabel("입금일", { exact: true }).fill("2026-10-28");
  await dialog.getByLabel("입금자명", { exact: true }).fill("테스트 입금자");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await dialog.getByRole("button", { name: "수정", exact: true }).click();
  await dialog.getByLabel("리뷰 마감일", { exact: true }).fill("2026-10-27");
  await expect(
    dialog.getByRole("spinbutton", { name: /^실제 누적 입금액/ }),
  ).toHaveValue("12000");
  await expect(dialog.getByLabel("입금자명", { exact: true })).toHaveValue(
    "테스트 입금자",
  );
  await dialog
    .getByRole("button", { name: "변경사항 저장", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await page.reload();
  const saved = await (await page.request.get("/api/reviews")).json();
  expect(saved.reviews[0]).toMatchObject({
    purchaser: "테스트 계정주",
    reviewedAt: "2026-10-26",
    dueDate: "2026-10-27",
    contact: "review_contact",
    kakaoName: "리뷰 담당자",
    depositor: "테스트 입금자",
    receivedAmount: 12000,
    paidAt: "2026-10-28",
  });
  expect(saved.payments).toHaveLength(1);
  expect(saved.payments[0]).toMatchObject({
    amount: 12000,
    paidAt: "2026-10-28",
  });
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: "내 리뷰" })
    .click();
  const region = page.getByRole("region", {
    name: "내 리뷰 목록",
    exact: true,
  });
  const labels = await region.getByRole("columnheader").allTextContents();
  for (const label of [
    "계정주",
    "구매일",
    "구매가",
    "구매 플랫폼",
    "리뷰 타입",
    "리뷰 가이드",
    "리뷰 작성",
    "리뷰 작성일",
    "리뷰 마감일",
    "페이백",
    "예상 페이백",
    "입금액",
    "정산일",
    "입금자명",
    "연락처",
    "카톡 이름",
  ])
    expect(labels).toContain(label);
  await expect(region.getByRole("row").last()).toContainText("리뷰 담당자");
  await expect(region.getByRole("row").last()).toContainText("review_contact");
  await expect(region.getByRole("row").last()).toContainText("부분 입금");
  await page.getByRole("button", { name: "표시할 열", exact: true }).click();
  await page.getByRole("button", { name: "핵심 열만", exact: true }).click();
  await expect(
    region.getByRole("columnheader", { name: "카톡 이름", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "전체 선택", exact: true }).click();
  await page.getByRole("button", { name: "열 선택 접기", exact: true }).click();
  // A wide table must scroll within its panel and keep the product identity pinned.
  const pinned = await region.locator("tbody .sticky-product").boundingBox();
  await region.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  const scrolled = await region.locator("tbody .sticky-product").boundingBox();
  expect(Math.abs(pinned!.x - scrolled!.x)).toBeLessThan(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const tableAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(tableAccessibility.violations).toEqual([]);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "내보내기", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  for (const value of [
    "계정주",
    "카톡 이름",
    "리뷰 작성일",
    "리뷰 담당자",
    "review_contact",
    "2026-10-26",
    "2026-10-27",
    "부분 입금",
  ])
    expect(csv).toContain(value);
  await page.getByRole("textbox", { name: "상품 검색" }).fill("리뷰 담당자");
  await expect(region.locator("tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-product")).not.toContainText(
    "테스트 계정주",
  );
  await expect(page.locator(".mobile-product")).toContainText("부분 입금");
  await page.locator(".mobile-product").click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("테스트 계정주", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("리뷰 담당자", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "수정", exact: true }).click();
  await expect(dialog.getByLabel("카톡 이름", { exact: true })).toHaveValue(
    "리뷰 담당자",
  );
  await dialog
    .getByRole("combobox", { name: "리뷰 상태", exact: true })
    .selectOption("todo");
  await expect(dialog.getByLabel("리뷰 작성일", { exact: false })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByLabel("리뷰 작성일", { exact: false }),
  ).toBeDisabled();
  await dialog.getByLabel("카톡 이름", { exact: true }).fill("수정한 담당자");
  await dialog.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(
    dialog.getByText("수정한 담당자", { exact: true }),
  ).toBeVisible();
  const updated = (await (await page.request.get("/api/reviews")).json())
    .reviews[0];
  expect(updated).toMatchObject({
    reviewedAt: "",
    reviewStatus: "todo",
    kakaoName: "수정한 담당자",
    contact: "review_contact",
    receivedAmount: 12000,
    paidAt: "2026-10-28",
    depositor: "테스트 입금자",
  });
});

test("column picker: toolbar alignment, grouped toggles, persistence and mobile cards", async ({
  page,
}) => {
  await seedWorkspace(page, false);
  const created = await page.request.post("/api/reviews", {
    data: sampleReviews()[0],
  });
  expect(created.status()).toBe(201);
  await page.goto("/?view=products");
  const trigger = page.getByRole("button", { name: "표시할 열", exact: true });
  const table = page.getByRole("region", { name: "내 리뷰 목록", exact: true });
  const picker = page.getByRole("region", {
    name: "표시할 열 선택",
    exact: true,
  });
  await expect(page.getByText(/상품명은 고정되어 있어요/)).toHaveCount(0);
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const controls = [
      page.getByRole("textbox", { name: "상품 검색" }),
      page.getByLabel("플랫폼 필터"),
      page.getByLabel("리뷰 타입 필터"),
      page.getByLabel("정렬"),
      trigger,
    ];
    const boxes = await Promise.all(
      controls.map((control) => control.boundingBox()),
    );
    for (let i = 1; i < boxes.length; i++) {
      expect(Math.abs(boxes[i]!.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
      expect(boxes[i]!.x).toBeGreaterThanOrEqual(
        boxes[i - 1]!.x + boxes[i - 1]!.width,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(
    picker.getByRole("button", { name: "상품명 / 판매처 (고정)", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await picker
    .getByRole("group", { name: "열 분류", exact: true })
    .getByRole("button", { name: "연락처", exact: true })
    .click();
  const options = picker.getByRole("group", {
    name: "연락처 표시 항목",
    exact: true,
  });
  await options.getByRole("button", { name: "카톡 이름", exact: true }).click();
  await expect(
    table.getByRole("columnheader", { name: "카톡 이름", exact: true }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader", { name: "연락처", exact: true }),
  ).toHaveCount(1);
  await options.getByRole("button", { name: "연락처", exact: true }).click();
  await expect(table.getByRole("columnheader")).toHaveCount(18);
  await options
    .getByRole("button", { name: "연락처", exact: true })
    .press("Escape");
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(
    table.getByRole("columnheader", { name: "카톡 이름", exact: true }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader", { name: "연락처", exact: true }),
  ).toHaveCount(0);
  await expect(table.getByRole("columnheader")).toHaveCount(18);
  // A page's column preferences do not remove fields from the other page.
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: /^페이백/ })
    .click();
  await expect(
    page
      .getByRole("region", { name: "페이백 목록", exact: true })
      .getByRole("columnheader", { name: "카톡 이름", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: /^내 리뷰/ })
    .click();
  await expect(
    table.getByRole("columnheader", { name: "카톡 이름", exact: true }),
  ).toHaveCount(0);
  await trigger.click();
  // Even with every optional column hidden, the product can still be opened.
  for (const button of await picker
    .getByRole("group", { name: "전체 표시 항목", exact: true })
    .getByRole("button")
    .all()) {
    if (
      (await button.getAttribute("aria-disabled")) !== "true" &&
      (await button.getAttribute("aria-pressed")) === "true"
    )
      await button.click();
  }
  await expect(table.getByRole("columnheader")).toHaveCount(2);
  await expect(table.locator("tbody .product-name-button")).toBeVisible();
  await picker.getByRole("button", { name: "핵심 열만", exact: true }).click();
  await expect(table.getByRole("columnheader")).toHaveCount(12);
  await picker
    .getByRole("group", { name: "열 분류", exact: true })
    .getByRole("button", { name: "리뷰 정보", exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/column-picker-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await picker
    .getByRole("button", { name: "열 선택 접기", exact: true })
    .click();
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await trigger.click();
    await picker
      .getByRole("button", { name: "핵심 열만", exact: true })
      .click();
    const card = page.locator(".mobile-product");
    await expect(
      card.locator("dt").filter({ hasText: "카톡 이름" }),
    ).toHaveCount(0);
    await picker
      .getByRole("group", { name: "열 분류", exact: true })
      .getByRole("button", { name: "연락처", exact: true })
      .click();
    await picker
      .getByRole("group", { name: "연락처 표시 항목", exact: true })
      .getByRole("button", { name: "카톡 이름", exact: true })
      .click();
    await expect(card).not.toContainText("브랜드 담당자");
    await expect(picker.locator(".mobile-column-note")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 360) {
      const mobileAccessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(mobileAccessibility.violations).toEqual([]);
    }
    const filterBoxes = await Promise.all(
      [
        page.getByLabel("플랫폼 필터"),
        page.getByLabel("리뷰 타입 필터"),
        page.getByLabel("정렬"),
        trigger,
      ].map((c) => c.boundingBox()),
    );
    expect(filterBoxes[0]!.y).toBe(filterBoxes[1]!.y);
    expect(filterBoxes[2]!.y).toBe(filterBoxes[3]!.y);
    expect(filterBoxes[2]!.y).toBeGreaterThan(filterBoxes[0]!.y);
    await page.screenshot({
      path: `docs/screenshots/column-picker-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await picker
      .getByRole("button", { name: "열 선택 접기", exact: true })
      .click();
  }
  await page.reload();
  await expect(page.locator(".mobile-product")).not.toContainText(
    "브랜드 담당자",
  );
  await page.locator(".mobile-product").click();
  await expect(
    page.getByRole("dialog").getByText("브랜드 담당자", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await trigger.click();
  await picker.getByRole("button", { name: "전체 선택", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(table.getByRole("columnheader")).toHaveCount(20);
});

test("guided review to settlement updates dashboard, monthly statistics and payment history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedWorkspace(page, false);
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("상품명").fill("단계 진행 텀블러");
  await dialog.getByLabel("리뷰 타입", { exact: true }).selectOption("빈박스");
  await dialog.getByRole("spinbutton", { name: /^구매금액/ }).fill("30000");
  await dialog.getByRole("button", { name: "상품 등록하기" }).click();
  const metric = (name: string) =>
    page.getByRole("region", { name, exact: true }).locator(".metric-value");
  const nav = page.getByRole("navigation", { name: "메인 메뉴", exact: true });
  async function checkMetrics(todo: string, pending: string, received: string) {
    await expect(metric("작성해야 할 리뷰")).toHaveText(todo);
    await expect(metric("받을 페이백")).toHaveText(pending);
    await expect(metric("정산 금액")).toHaveText(received);
  }
  await checkMetrics("1건", "30,000원", "0원");
  await nav.getByRole("button", { name: /^내 리뷰/ }).click();
  await page.getByRole("tab", { name: "작성 전", exact: true }).click();
  const steps = page
    .getByRole("region", { name: "내 리뷰 목록", exact: true })
    .getByRole("group", { name: "단계 진행 텀블러 진행 단계", exact: true });
  await expect(steps.getByRole("button")).toHaveCount(1);
  await expect(
    steps.getByRole("button", { name: "정산 완료 전환", exact: true }),
  ).toHaveCount(0);
  await steps.getByRole("button", { name: "리뷰 완료", exact: true }).click();
  await dialog.getByLabel("리뷰 작성일", { exact: true }).fill(dateOffset(-1));
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  let state = await (await page.request.get("/api/reviews")).json();
  expect(state.reviews[0]).toMatchObject({
    reviewStatus: "todo",
    receivedAmount: 0,
    version: 1,
  });
  await steps.getByRole("button", { name: /리뷰 완료/ }).click();
  await dialog.getByLabel("리뷰 작성일", { exact: true }).fill(dateOffset(-1));
  await dialog
    .getByRole("combobox", { name: "리뷰 유형", exact: true })
    .selectOption("텍스트 리뷰");
  await dialog.getByLabel("메모", { exact: true }).fill("사용 후기 작성 완료");
  await page.screenshot({
    path: "docs/screenshots/review-stage-form.png",
    fullPage: true,
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
  await expect(
    page.getByRole("tab", { name: "리뷰 완료", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(steps.getByRole("button", { name: /정산 완료/ })).toBeEnabled();
  await expect(steps.getByRole("button")).toHaveCount(1);
  await expect(
    steps.getByRole("button", { name: "리뷰 완료", exact: true }),
  ).toHaveCount(0);
  state = await (await page.request.get("/api/reviews")).json();
  expect(state.reviews[0]).toMatchObject({
    reviewStatus: "done",
    reviewedAt: dateOffset(-1),
    reviewType: "텍스트 리뷰",
    receivedAmount: 0,
  });
  expect(state.payments).toHaveLength(0);
  await nav.getByRole("button", { name: "대시보드", exact: true }).click();
  await checkMetrics("0건", "30,000원", "0원");
  await nav.getByRole("button", { name: "통계", exact: true }).click();
  await page.locator(".analysis-detail summary").click();
  const monthRow = () =>
    page
      .locator("tbody tr")
      .filter({ hasText: today().slice(0, 7).replace("-", "년 ") + "월" });
  await expect(monthRow().getByRole("cell").nth(2)).toHaveText("1건");
  await expect(monthRow().getByRole("cell").nth(4)).toHaveText("0원");
  await nav.getByRole("button", { name: /^내 리뷰/ }).click();
  await steps.getByRole("button", { name: /정산 완료/ }).click();
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("10000");
  await dialog.getByLabel("입금자명", { exact: true }).fill("브랜드 담당자");
  await expect(dialog.getByRole("status")).toContainText(
    "부분 입금 · 정산 대기",
  );
  await page.screenshot({
    path: "docs/screenshots/settlement-stage-form.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(steps.getByRole("button", { name: /정산 완료/ })).toBeEnabled();
  await nav.getByRole("button", { name: "대시보드", exact: true }).click();
  await checkMetrics("0건", "20,000원", "10,000원");
  await nav.getByRole("button", { name: "통계", exact: true }).click();
  await page.locator(".analysis-detail summary").click();
  await expect(monthRow().getByRole("cell").nth(4)).toHaveText("10,000원");
  await nav.getByRole("button", { name: /^내 리뷰/ }).click();
  await page.getByRole("tab", { name: "리뷰 완료", exact: true }).click();
  await steps.getByRole("button", { name: /정산 완료/ }).click();
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "20000",
  );
  await expect(dialog.getByRole("status")).toContainText(
    "전액 입금 · 정산 완료",
  );
  await dialog
    .getByRole("button", { name: "정산 완료 저장", exact: true })
    .click({ clickCount: 2 });
  await expect(dialog).toBeHidden();
  await expect(steps.getByRole("button")).toHaveCount(0);
  await expect(steps).toHaveText("정산 완료");
  await expect(
    page.getByRole("tab", { name: "정산 완료", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  state = await (await page.request.get("/api/reviews")).json();
  expect(state.reviews[0]).toMatchObject({
    reviewStatus: "done",
    receivedAmount: 30000,
    depositor: "브랜드 담당자",
  });
  expect(
    state.payments
      .map((p: { amount: number }) => p.amount)
      .sort((a: number, b: number) => a - b),
  ).toEqual([10000, 20000]);
  await page.screenshot({
    path: "docs/screenshots/review-workflow-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await nav.getByRole("button", { name: "대시보드", exact: true }).click();
  await checkMetrics("0건", "0원", "30,000원");
  await page.screenshot({
    path: "docs/screenshots/dashboard-slate.png",
    fullPage: true,
    animations: "disabled",
  });
  await nav.getByRole("button", { name: "통계", exact: true }).click();
  await page.locator(".analysis-detail summary").click();
  await expect(monthRow().getByRole("cell").nth(2)).toHaveText("1건");
  await expect(monthRow().getByRole("cell").nth(4)).toHaveText("30,000원");
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "수익 구성", exact: true })
      .locator(".analysis-income-context dd")
      .last(),
  ).toHaveText("30,000원");
  await page.locator(".analysis-detail summary").click();
  await expect(monthRow().getByRole("cell").nth(4)).toHaveText("30,000원");
});

test("mobile workflow keeps input after failure and rejects stale or excessive payments", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedWorkspace(page, false);
  await page.request.post("/api/reviews", { data: sampleReviews()[0] });
  await page.request.post("/api/reviews", {
    data: {
      ...sampleReviews()[0],
      name: "정산 없는 리뷰",
      expectedPayback: 0,
      paybackMode: "custom",
      shippingMethod: "실배송",
      reviewStatus: "done",
      reviewedAt: today(),
    },
  });
  await page.goto("/?view=products");
  await page
    .locator(".mobile-product")
    .filter({ hasText: "정산 없는 리뷰" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .locator(".detail-footer")
      .getByRole("button", { name: "정산 완료", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "정산 완료", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/현재 받을 금액이 0원/),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "정산 완료 저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await page
    .locator(".mobile-product")
    .filter({ hasText: "라운드랩 1025 독도 토너 200ml" })
    .click();
  const steps = page.getByRole("dialog").locator(".detail-footer");
  await steps.getByRole("button", { name: /리뷰 완료/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("메모", { exact: true }).fill("실패해도 보존할 입력");
  await page.route(
    "**/api/reviews/*",
    async (route) => {
      if (route.request().method() === "PUT")
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: "저장에 실패했습니다. 다시 시도해 주세요.",
          }),
        });
      else await route.continue();
    },
    { times: 1 },
  );
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("저장에 실패");
  await expect(dialog.getByLabel("메모", { exact: true })).toHaveValue(
    "실패해도 보존할 입력",
  );
  let state = await (await page.request.get("/api/reviews")).json();
  expect(
    state.reviews.find((i: { name: string }) => i.name.startsWith("라운드랩"))
      .reviewStatus,
  ).toBe("todo");
  await dialog
    .getByRole("button", { name: "리뷰 완료 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  await steps.getByRole("button", { name: /정산 완료/ }).click();
  state = await (await page.request.get("/api/reviews")).json();
  const current = state.reviews.find((i: { name: string }) =>
    i.name.startsWith("라운드랩"),
  );
  const concurrent = await page.request.put(`/api/reviews/${current.id}`, {
    data: { ...current, memo: "다른 화면에서 수정" },
  });
  expect(concurrent.status()).toBe(200);
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("5000");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("다른 화면에서 변경");
  await expect(dialog.getByLabel("이번 입금액", { exact: true })).toHaveValue(
    "5000",
  );
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.reload();
  await page
    .locator(".mobile-product")
    .filter({ hasText: "라운드랩 1025 독도 토너 200ml" })
    .click();
  await steps.getByRole("button", { name: /정산 완료/ }).click();
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("19000");
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  expect(
    await dialog
      .getByLabel("이번 입금액", { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.rangeOverflow),
  ).toBe(true);
  await dialog.getByLabel("이번 입금액", { exact: true }).fill("5000");
  const modalBounds = await dialog.boundingBox();
  expect(modalBounds!.y).toBe(0);
  expect(modalBounds!.height).toBe(844);
  await page.screenshot({
    path: "docs/screenshots/review-workflow-mobile.png",
    fullPage: false,
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
  await dialog
    .getByRole("button", { name: "부분 입금 저장", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "상품 상세", exact: true }),
  ).toBeVisible();
  state = await (await page.request.get("/api/reviews")).json();
  const updated = state.reviews.find(
    (i: { id: string }) => i.id === current.id,
  );
  expect(updated).toMatchObject({
    reviewStatus: "done",
    receivedAmount: 5000,
    memo: "다른 화면에서 수정",
  });
  expect(state.payments).toHaveLength(1);
  await page.reload();
  await expect(
    page
      .locator(".mobile-product")
      .filter({ hasText: "라운드랩 1025 독도 토너 200ml" }),
  ).toContainText("부분 입금");
});
