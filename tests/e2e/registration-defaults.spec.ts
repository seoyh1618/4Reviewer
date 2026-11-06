import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

async function signup(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `profiles-${randomUUID()}@example.test`,
          password: "Pass1234",
        },
      })
    ).status(),
  ).toBe(201);
}
const savedInput = {
  values: {
    purchaser: "저장한 계정주",
    platform: "기타",
    platformOther: "테스트 마켓",
    shippingMethod: "빈박스",
    reviewType: "텍스트 리뷰",
    additionalReviewFee: 2500,
  },
  enabledFields: [
    "purchaser",
    "platform",
    "shippingMethod",
    "reviewType",
    "additionalReviewFee",
  ],
  version: 0,
};

for (const width of [390, 1280]) {
  test(`grouped personal information persists, selects profiles and preserves reviews at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await signup(page);
    await page.goto("/?view=defaults");
    const region = page.getByRole("region", {
      name: "내 정보 묶음",
      exact: true,
    });
    await region
      .getByRole("button", { name: "묶음 추가", exact: true })
      .click();
    let editor = region.getByRole("form", {
      name: "새 정보 묶음",
      exact: true,
    });
    await editor.getByLabel(/^이름/).fill("테스트 계정");
    await editor.getByLabel("전화번호", { exact: true }).fill("010-0000-1234");
    await editor
      .getByLabel("주소", { exact: true })
      .fill("테스트시 테스트로 123, 101호");
    await editor
      .getByLabel("이메일", { exact: true })
      .fill("example@example.test");
    await editor.getByLabel("은행", { exact: true }).fill("테스트은행");
    await editor.getByLabel("계좌번호", { exact: true }).fill("001-000-1234");
    await editor.getByLabel("예금주", { exact: true }).fill("테스트 예금주");
    await editor
      .getByRole("combobox", { name: /^구매 플랫폼/ })
      .selectOption("기타");
    await editor.getByLabel(/^기타 플랫폼 이름/).fill("테스트 마켓");
    await editor.locator("summary").click();
    await editor
      .getByRole("combobox", { name: "리뷰 타입", exact: true })
      .selectOption("빈박스");
    await editor
      .getByRole("combobox", { name: "리뷰 가이드", exact: true })
      .selectOption("텍스트 리뷰");
    await editor
      .getByRole("spinbutton", { name: "리뷰비", exact: true })
      .fill("2500");
    for (const label of [
      "계정주",
      "구매 플랫폼",
      "리뷰 타입",
      "리뷰 가이드",
      "리뷰비",
    ])
      await editor.getByRole("checkbox", { name: label, exact: true }).check();
    await editor.getByRole("button", { name: "저장", exact: true }).click();
    await expect(region.getByRole("status")).toHaveText(
      "정보 묶음을 저장했습니다.",
    );
    let result = await (
      await page.request.get("/api/registration-profiles")
    ).json();
    expect(result.profiles[0].details).toEqual({
      phone: "010-0000-1234",
      address: "테스트시 테스트로 123, 101호",
      email: "example@example.test",
      bank: "테스트은행",
      accountNumber: "001-000-1234",
      accountHolder: "테스트 예금주",
    });
    const firstId = result.profiles[0].id;
    editor = region.getByRole("form", {
      name: "테스트 계정 · 테스트 마켓 수정",
      exact: true,
    });
    for (const w of width === 390 ? [320, 390] : [1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await editor.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    await page
      .getByRole("heading", { name: "내 정보 관리", exact: true })
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`profiles-expanded-${width}.png`),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .include(".registration-defaults-panel")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);

    await region
      .getByRole("button", { name: "묶음 추가", exact: true })
      .click();
    editor = region.getByRole("form", { name: "새 정보 묶음", exact: true });
    await editor.getByLabel(/^이름/).fill("다른 계정");
    await editor
      .getByRole("combobox", { name: /^구매 플랫폼/ })
      .selectOption("네이버");
    await editor.getByRole("button", { name: "저장", exact: true }).click();
    await expect(region.locator(".profile-card")).toHaveCount(2);
    result = await (
      await page.request.get("/api/registration-profiles")
    ).json();
    const secondId = result.profiles.find(
      (p: { id: string }) => p.id !== firstId,
    ).id;
    await page.reload();
    await expect(
      region.locator(".profile-toggle[aria-expanded=false]"),
    ).toHaveCount(2);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(region.locator(".profile-toggle").first()).not.toContainText(
      "001-000-1234",
    );
    await page.screenshot({
      path: info.outputPath(`profiles-list-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    const form = page.getByRole("dialog", {
      name: "새 상품 등록",
      exact: true,
    });
    await expect(
      form.getByRole("region", { name: "내 기본정보 자동 채움" }),
    ).toHaveCount(0);
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "테스트 계정",
    );
    await expect(form.getByLabel("리뷰비", { exact: true })).toHaveValue(
      "2500",
    );
    await form
      .getByRole("combobox", { name: "사용할 정보 묶음" })
      .selectOption(secondId);
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "다른 계정",
    );
    await expect(
      form.getByRole("combobox", { name: /^구매 플랫폼/ }),
    ).toHaveValue("네이버");
    await expect(form.getByLabel("리뷰비", { exact: true })).toHaveValue("0");
    await form.getByLabel("계정주 (구매 계정)").fill("이번 구매 계정");
    await form
      .getByRole("combobox", { name: "사용할 정보 묶음" })
      .selectOption(firstId);
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "이번 구매 계정",
    );
    await form.getByLabel("상품명").fill("묶음 선택 등록검증");
    await form.getByLabel("구매금액").fill("10000");
    await form.getByRole("button", { name: "상품 등록하기" }).click();
    await expect(form).toHaveCount(0);
    const reviews = await (await page.request.get("/api/reviews")).json();
    expect(reviews.reviews[0]).toMatchObject({
      purchaser: "이번 구매 계정",
      platform: "기타",
      platformOther: "테스트 마켓",
      shippingMethod: "빈박스",
      additionalReviewFee: 2500,
      receivedAmount: 0,
    });
    await region.getByRole("button", { name: /다른 계정 · 네이버/ }).click();
    editor = region.getByRole("form", {
      name: "다른 계정 · 네이버 수정",
      exact: true,
    });
    await editor
      .getByRole("checkbox", { name: "기본 묶음으로 사용", exact: true })
      .check();
    await editor.getByRole("button", { name: "저장", exact: true }).click();
    await expect(
      region.getByRole("button", { name: /다른 계정 · 네이버/ }),
    ).toContainText("기본");
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "다른 계정",
    );
    await form.getByRole("button", { name: "취소", exact: true }).click();
    await editor.getByRole("button", { name: "삭제", exact: true }).click();
    await editor
      .getByRole("button", { name: "묶음 삭제", exact: true })
      .click();
    await expect(region.locator(".profile-card")).toHaveCount(1);
    await expect(
      region.getByRole("button", { name: /테스트 계정 · 테스트 마켓/ }),
    ).toContainText("기본");
    expect(
      (await (await page.request.get("/api/reviews")).json()).reviews[0]
        .purchaser,
    ).toBe("이번 구매 계정");
    await page.getByRole("button", { name: "내 계정", exact: true }).click();
    const account = page.getByRole("dialog", { name: "내 계정", exact: true });
    await account
      .getByRole("button", { name: /테스트 계정 · 테스트 마켓/ })
      .click();
    await expect(account.getByLabel("주소", { exact: true })).toHaveValue(
      "테스트시 테스트로 123, 101호",
    );
    await account
      .getByLabel("주소", { exact: true })
      .fill("수정한 테스트 주소");
    await account.getByRole("button", { name: "저장", exact: true }).click();
    await expect(account.getByRole("status")).toContainText("저장했습니다");
    await page.reload();
    await region
      .getByRole("button", { name: /테스트 계정 · 테스트 마켓/ })
      .click();
    await expect(region.getByLabel("주소", { exact: true })).toHaveValue(
      "수정한 테스트 주소",
    );
  });
}

test("late profiles preserve manual input and switching accounts cannot reuse another user's defaults", async ({
  page,
}) => {
  await signup(page);
  expect(
    (
      await page.request.put("/api/registration-defaults", { data: savedInput })
    ).status(),
  ).toBe(200);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/registration-profiles", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  const form = page.getByRole("dialog", { name: "새 상품 등록", exact: true });
  await form.getByLabel("계정주 (구매 계정)").fill("이미 입력한 계정");
  await form
    .getByRole("combobox", { name: /^구매 플랫폼/ })
    .selectOption("11번가");
  release();
  await expect(form.getByLabel("리뷰비", { exact: true })).toHaveValue("2500");
  await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
    "이미 입력한 계정",
  );
  await expect(
    form.getByRole("combobox", { name: /^구매 플랫폼/ }),
  ).toHaveValue("11번가");
  await expect(form.getByLabel("기타 플랫폼 이름")).toHaveCount(0);
  await page.unroute("**/api/registration-profiles");
  await page.request.post("/api/auth/logout");
  await signup(page);
  await page.reload();
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(
    form.getByRole("button", { name: "상품 등록하기", exact: true }),
  ).toBeEnabled();
  await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue("");
  await expect(form.getByLabel("리뷰비", { exact: true })).toHaveValue("0");
  await expect(
    form.getByRole("combobox", { name: "사용할 정보 묶음" }),
  ).toHaveCount(0);
});
