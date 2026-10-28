import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

test("template groups: create, assign, move, ungroup and persist on desktop and mobile", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  expect(
    (
      await page.request.post("/api/auth/signup", {
        data: {
          email: `groups-${randomUUID()}@example.test`,
          password: "TemplateGroups-1234",
          signupCode: "3333",
        },
      })
    ).status(),
  ).toBe(201);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=templates");
  const filters = page.getByRole("group", {
    name: "템플릿 그룹 필터",
    exact: true,
  });
  const dialog = page.getByRole("dialog");
  await expect(
    filters.getByRole("button", { name: "미분류 (6)", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "그룹 만들기", exact: true }).click();
  await dialog.getByLabel("그룹 이름", { exact: true }).fill("식품 후기");
  await page.route("**/api/template-groups", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "그룹 저장 연결 확인" }),
    }),
  );
  await dialog
    .getByRole("button", { name: "그룹 만들기", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText("그룹 저장 연결 확인");
  await expect(dialog.getByLabel("그룹 이름", { exact: true })).toHaveValue(
    "식품 후기",
  );
  await page.unroute("**/api/template-groups");
  await dialog
    .getByRole("button", { name: "그룹 만들기", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    filters.getByRole("button", { name: "식품 후기 (0)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", {
      name: "이 그룹에 템플릿이 없습니다",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "이 그룹에 템플릿 추가", exact: true })
    .click();
  await expect(
    dialog.getByLabel("템플릿 그룹", { exact: true }).locator("option:checked"),
  ).toHaveText("식품 후기");
  await dialog
    .getByLabel("템플릿 이름", { exact: true })
    .fill("나의 간식 후기");
  await dialog
    .getByLabel("리뷰 내용", { exact: true })
    .fill("직접 먹어본 간식의 맛과 식감을 기록해요.");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  const custom = page.getByRole("article", {
    name: "나의 간식 후기",
    exact: true,
  });
  await expect(custom).toContainText("식품 후기");
  await custom.getByRole("button", { name: "복사", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "직접 먹어본 간식의 맛과 식감을 기록해요.",
  );
  await filters
    .getByRole("button", { name: "전체 그룹 (7)", exact: true })
    .click();
  const starter = page.getByRole("article", {
    name: "간단한 사용 후기",
    exact: true,
  });
  await starter.getByRole("button", { name: "수정", exact: true }).click();
  await dialog
    .getByLabel("템플릿 그룹", { exact: true })
    .selectOption({ label: "식품 후기" });
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(
    filters.getByRole("button", { name: "식품 후기 (2)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("템플릿 검색").fill("간식");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByLabel("템플릿 검색").fill("");
  await page
    .getByRole("group", { name: "리뷰 유형 필터", exact: true })
    .getByRole("button", { name: "사진 리뷰", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page
    .getByRole("group", { name: "리뷰 유형 필터", exact: true })
    .getByRole("button", { name: "전체", exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/template-groups-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);

  await page.setViewportSize({ width: 360, height: 844 });
  await page.getByRole("button", { name: "그룹 만들기", exact: true }).click();
  await dialog.getByLabel("그룹 이름", { exact: true }).fill("식품 후기");
  await dialog
    .getByRole("button", { name: "그룹 만들기", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("같은 이름의 그룹");
  const secondGroup = "자주 쓰는 뷰티 및 생활용품 실사용 후기 모음";
  await dialog.getByLabel("그룹 이름", { exact: true }).fill(secondGroup);
  await dialog
    .getByRole("button", { name: "그룹 만들기", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await filters
    .getByRole("button", { name: "식품 후기 (2)", exact: true })
    .click();
  await custom.getByRole("button", { name: "수정", exact: true }).click();
  await dialog
    .getByLabel("템플릿 그룹", { exact: true })
    .selectOption({ label: secondGroup });
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(custom).toContainText(secondGroup);
  await page.reload();
  await expect(
    filters.getByRole("button", { name: `${secondGroup} (1)`, exact: true }),
  ).toBeVisible();
  await filters
    .getByRole("button", { name: `${secondGroup} (1)`, exact: true })
    .click();
  await page.screenshot({
    path: "docs/screenshots/template-groups-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await custom.getByRole("button", { name: "수정", exact: true }).click();
  await dialog.getByLabel("템플릿 그룹", { exact: true }).selectOption("");
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    filters.getByRole("button", { name: "미분류 (6)", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(custom).toContainText("미분류");
  await expect(
    filters.getByRole("button", { name: `${secondGroup} (0)`, exact: true }),
  ).toBeVisible();
  await filters
    .getByRole("button", { name: "식품 후기 (1)", exact: true })
    .click();
  await expect(starter).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
});
