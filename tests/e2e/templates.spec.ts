import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test.use({ actionTimeout: 15000 });
async function openTemplates(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `templates-${randomUUID()}@example.test`,
          password: "TemplatePass-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "메인 메뉴", exact: true })
    .getByRole("button", { name: "리뷰 템플릿", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "리뷰 템플릿", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(6);
}

test("review templates: defaults, search, edit, clipboard, create and persistent refresh", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openTemplates(page);
  await page.screenshot({
    path: "docs/screenshots/review-templates-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "사진 리뷰", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByLabel("템플릿 검색").fill("뷰티");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("템플릿 검색").fill("존재하지않는템플릿");
  await expect(
    page.getByRole("heading", { name: "검색 결과가 없습니다" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "전체 템플릿 보기" }).click();
  const card = page.getByRole("article", {
    name: "간단한 사용 후기",
    exact: true,
  });
  const original = (await (await page.request.get("/api/templates")).json())
    .templates[0];
  await card.getByRole("button", { name: "복사", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "복사됨", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    original.content,
  );
  await card.getByRole("button", { name: "수정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const content =
    "텀블러를 일주일 동안 사용했어요.\n뚜껑을 분리해 씻을 수 있어 편했어요.\n차량 컵홀더 크기는 구매 전에 확인해 보세요.";
  await dialog
    .getByLabel("템플릿 이름", { exact: true })
    .fill("나의 텀블러 후기");
  await dialog.getByLabel("리뷰 내용", { exact: true }).fill(content);
  await dialog.getByRole("button", { name: "내용 복사", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    content,
  );
  await page.screenshot({
    path: "docs/screenshots/review-template-editor.png",
    fullPage: false,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const savedCard = page.getByRole("article", {
    name: "나의 텀블러 후기",
    exact: true,
  });
  await expect(savedCard).toContainText(content);
  await page.reload();
  await expect(savedCard).toBeVisible();
  await expect(page).toHaveURL(/view=templates/);
  await savedCard.getByRole("button", { name: "수정", exact: true }).click();
  await dialog
    .getByLabel("리뷰 내용", { exact: true })
    .fill("저장하지 않을 내용");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await savedCard.getByRole("button", { name: "복사", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    content,
  );
  await page.getByRole("button", { name: "새 템플릿", exact: true }).click();
  await dialog
    .getByLabel("템플릿 이름", { exact: true })
    .fill("나의 주방용품 사진 후기");
  await dialog
    .getByLabel("리뷰 유형", { exact: true })
    .selectOption("사진 리뷰");
  await dialog
    .getByLabel("리뷰 내용", { exact: true })
    .fill("[상품명]의 사용 모습을 남겨요.\n[실제 사용 경험]");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  const personal = page.getByRole("article", {
    name: "나의 주방용품 사진 후기",
    exact: true,
  });
  await expect(personal).toContainText("내 템플릿");
  await page.reload();
  await expect(personal).toBeVisible();
  const current = (
    await (await page.request.get("/api/templates")).json()
  ).templates.find((t: { id: string }) => t.id === original.id);
  expect(
    (
      await page.request.put(`/api/templates/${original.id}`, {
        data: { ...current, content: "다른 기기에서 수정한 본문" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(savedCard).toContainText("다른 기기에서 수정한 본문");
  expect(errors).toEqual([]);
});

test("review templates: responsive navigation, failures, stale saves and clipboard fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openTemplates(page);
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const nav = page.getByRole("navigation", { name: "모바일 메뉴" });
    await expect(nav.getByRole("button")).toHaveCount(6);
    await nav.getByRole("button", { name: "대시보드", exact: true }).click();
    await nav.getByRole("button", { name: "템플릿", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(6);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    for (const button of await nav.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    if (width === 360) {
      await page.screenshot({
        path: "docs/screenshots/review-templates-mobile.png",
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
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.getByRole("article", {
    name: "간단한 사용 후기",
    exact: true,
  });
  await card.getByRole("button", { name: "수정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("리뷰 내용", { exact: true })
    .fill("저장 실패 후에도 남겨둘 본문\n두 번째 줄");
  await page.route("**/api/templates/starter-basic", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "저장 연결 확인" }),
    }),
  );
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("저장 연결 확인");
  await expect(dialog.getByLabel("리뷰 내용", { exact: true })).toHaveValue(
    "저장 실패 후에도 남겨둘 본문\n두 번째 줄",
  );
  await page.unroute("**/api/templates/starter-basic");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(card).toContainText("저장 실패 후에도 남겨둘 본문");
  await card.getByRole("button", { name: "수정", exact: true }).click();
  const saved = (await (await page.request.get("/api/templates")).json())
    .templates[0];
  expect(
    (
      await page.request.put(`/api/templates/${saved.id}`, {
        data: { ...saved, content: "먼저 저장된 새 버전" },
      })
    ).ok(),
  ).toBeTruthy();
  await dialog
    .getByLabel("리뷰 내용", { exact: true })
    .fill("충돌한 화면의 입력");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "다른 화면에서 수정된 템플릿",
  );
  await expect(dialog.getByLabel("리뷰 내용", { exact: true })).toHaveValue(
    "충돌한 화면의 입력",
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Permission denied", "NotAllowedError");
        },
      },
    });
  });
  await dialog.getByRole("button", { name: "내용 복사", exact: true }).click();
  await expect(dialog.getByText(/선택된 본문을 길게/)).toBeVisible();
  expect(
    await dialog
      .getByLabel("리뷰 내용", { exact: true })
      .evaluate(
        (el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart,
      ),
  ).toBe("충돌한 화면의 입력".length);
  await page.screenshot({
    path: "docs/screenshots/review-template-mobile-editor.png",
    fullPage: false,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(card).toContainText("먼저 저장된 새 버전");
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole("button", { name: "복사", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "리뷰 내용 복사" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("복사할 리뷰 내용")).toHaveValue(
    "먼저 저장된 새 버전",
  );
  await dialog.getByRole("button", { name: "전체 선택", exact: true }).click();
  expect(
    await dialog
      .getByLabel("복사할 리뷰 내용")
      .evaluate(
        (el: HTMLTextAreaElement) => el.selectionEnd - el.selectionStart,
      ),
  ).toBe("먼저 저장된 새 버전".length);
  await dialog
    .getByRole("button", { name: "닫기", exact: true })
    .last()
    .click();
  await page.route("**/api/templates", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "불러오기 연결 확인" }),
    }),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("불러오기 연결 확인");
  await expect(page.getByRole("article")).toHaveCount(6);
  await page.unroute("**/api/templates");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
