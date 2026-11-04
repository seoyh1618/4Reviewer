import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

async function signup(page: Page) {
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email: `defaults-${randomUUID()}@example.test`,
      password: "Pass1234",
    },
  });
  expect(response.status()).toBe(201);
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
  test(`saved defaults can be selected on registration and survive reload at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await signup(page);
    await page.goto("/?view=products");
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    const form = page.getByRole("dialog", {
      name: "새 상품 등록",
      exact: true,
    });
    await form.getByLabel("상품명").fill("기본정보 등록검증");
    await form
      .getByRole("button", { name: "기본정보 설정", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "상품 등록 기본정보",
      exact: true,
    });
    await settings
      .getByLabel("계정주", { exact: true })
      .fill(savedInput.values.purchaser);
    await settings
      .getByLabel("구매 플랫폼", { exact: true })
      .selectOption("기타");
    await settings
      .getByLabel("기타 플랫폼 이름", { exact: true })
      .fill(savedInput.values.platformOther);
    await settings
      .getByLabel("리뷰 타입", { exact: true })
      .selectOption("빈박스");
    await settings
      .getByLabel("리뷰 가이드", { exact: true })
      .selectOption("텍스트 리뷰");
    await settings.getByLabel("리뷰비", { exact: true }).fill("2500");
    for (const label of [
      "계정주",
      "구매 플랫폼",
      "리뷰 타입",
      "리뷰 가이드",
      "리뷰비",
    ])
      await settings.getByLabel(`${label} 자동 채움`, { exact: true }).check();
    if (width === 390) {
      for (const w of [320, 390]) {
        await page.setViewportSize({ width: w, height: 700 });
        await expect(
          settings.getByRole("button", { name: "기본정보 저장", exact: true }),
        ).toBeInViewport();
        await expect(
          settings.getByRole("heading", {
            name: "상품 등록 기본정보",
            exact: true,
          }),
        ).toBeInViewport();
        expect(
          await settings.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(
          await settings
            .locator(".modal-body")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
      await settings.locator(".modal-body").evaluate((el) => {
        el.scrollTop = 0;
      });
    }
    await page.screenshot({
      path: `docs/screenshots/registration-defaults-${info.project.name}-${width}.png`,
    });
    const accessibility = await new AxeBuilder({ page })
      .include(".defaults-settings-modal")
      .analyze();
    expect(
      accessibility.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await settings
      .getByRole("button", { name: "기본정보 저장", exact: true })
      .click();
    await expect(settings).toHaveCount(0);
    await expect(form.getByLabel("상품명")).toHaveValue("기본정보 등록검증");
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "저장한 계정주",
    );
    await expect(form.getByLabel("리뷰비", { exact: true })).toHaveValue(
      "2500",
    );
    await expect(
      form.getByRole("combobox", { name: /^구매 플랫폼/ }),
    ).toHaveValue("기타");
    await expect(form.getByLabel("기타 플랫폼 이름")).toHaveValue(
      "테스트 마켓",
    );
    await form.locator(".registration-prefill summary").click();
    await form.getByLabel("이번 상품 계정주 자동 채움").uncheck();
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue("");
    await form.getByLabel("이번 상품 계정주 자동 채움").check();
    await form.getByLabel("계정주 (구매 계정)").fill("이번 구매 계정");
    await form.getByLabel("이번 상품 계정주 자동 채움").uncheck();
    await form.getByLabel("이번 상품 계정주 자동 채움").check();
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "이번 구매 계정",
    );
    await form.getByLabel("구매금액").fill("10000");
    await form.getByRole("button", { name: "상품 등록하기" }).click();
    await expect(form).toHaveCount(0);
    const reviews = await (await page.request.get("/api/reviews")).json();
    expect(reviews.reviews[0]).toMatchObject({
      purchaser: "이번 구매 계정",
      platform: "기타",
      platformOther: "테스트 마켓",
      shippingMethod: "빈박스",
      price: 10000,
      expectedPayback: 10000,
      additionalReviewFee: 2500,
      reviewStatus: "todo",
      receivedAmount: 0,
    });
    await page.reload();
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "저장한 계정주",
    );
    await expect(form.getByLabel("상품명")).toHaveValue("");
    await expect(form.getByLabel("구매금액")).toHaveValue("0");
    await expect(form.getByLabel("리뷰 마감일", { exact: true })).toHaveValue(
      "",
    );
    await page.screenshot({
      path: `docs/screenshots/registration-prefill-${info.project.name}-${width}.png`,
    });
    await form.getByRole("button", { name: "취소", exact: true }).click();
    await page.getByRole("button", { name: "내 계정", exact: true }).click();
    const account = page.getByRole("dialog", { name: "내 계정", exact: true });
    const preferences = account.getByRole("form", {
      name: "상품 등록 기본정보",
    });
    await expect(preferences.getByLabel("계정주", { exact: true })).toHaveValue(
      "저장한 계정주",
    );
    await preferences
      .getByLabel("계정주", { exact: true })
      .fill("다음 등록 계정");
    await preferences
      .getByRole("button", { name: "기본정보 저장", exact: true })
      .click();
    await expect(preferences.getByRole("status")).toContainText("저장했습니다");
    const unchanged = await (await page.request.get("/api/reviews")).json();
    expect(unchanged.reviews[0].purchaser).toBe("이번 구매 계정");
    await account
      .locator(".modal-footer")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    await page.getByRole("button", { name: "상품 등록", exact: true }).click();
    await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue(
      "다음 등록 계정",
    );
  });
}

test("late defaults preserve manual input and account changes cannot reuse another user's defaults", async ({
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
  await page.route("**/api/registration-defaults", async (route) => {
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
  await page.unroute("**/api/registration-defaults");
  await page.request.post("/api/auth/logout");
  await signup(page);
  await page.reload();
  await page.getByRole("button", { name: "상품 등록", exact: true }).click();
  await expect(
    form.getByText(
      "자주 쓰는 계정주와 리뷰 조건을 저장해 자동으로 채워 보세요.",
    ),
  ).toBeVisible();
  await expect(form.getByLabel("계정주 (구매 계정)")).toHaveValue("");
  await expect(form.getByLabel("리뷰비", { exact: true })).toHaveValue("0");
});
