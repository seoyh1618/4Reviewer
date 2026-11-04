import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

const password = "BeforeReset123";
const nextPassword = "AfterReset456";
const answer = "파란 종이배의 추억";
async function fits(page: Page) {
  const dialog = page.getByRole("dialog").last();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(dialog.locator(".modal-footer")).toBeInViewport();
}
async function acknowledgeCode(page: Page, reset = false) {
  const dialog = page.getByRole("dialog").last();
  const code = await dialog
    .getByLabel("새 복구코드", { exact: true })
    .inputValue();
  expect(code).toMatch(/^([A-F0-9]{4}-){7}[A-F0-9]{4}$/);
  const done = dialog.getByRole("button", {
    name: reset ? "로그인으로 돌아가기" : "확인",
    exact: true,
  });
  await expect(done).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("복구코드를 안전한 곳에 보관했습니다.").check();
  await done.click();
  return code;
}
test("phone signup and question plus recovery code reset preserve the login identity", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "비밀번호 찾기", exact: true }),
  ).toBeVisible();
  const orbit = await page.locator(".orbit").boundingBox();
  expect(orbit!.width).toBe(220);
  expect(orbit!.height).toBe(220);
  const username = `recovery_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await page
    .getByRole("button", { name: "아이디로 가입", exact: true })
    .click();
  await page.getByLabel("아이디", { exact: true }).fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByLabel("비밀번호 복구 수단 등록 (선택)").check();
  await page
    .getByLabel("인증 질문", { exact: true })
    .selectOption("secret_phrase");
  await page.getByLabel("인증 답변", { exact: true }).fill(answer);
  await page.getByLabel("인증 답변 확인", { exact: true }).fill(answer);
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "복구코드를 보관해 주세요" }),
  ).toBeVisible();
  await fits(page);
  const code = await acknowledgeCode(page);
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
  ).toBeVisible();
  await page.request.post("/api/auth/logout", { data: {} });
  await page.reload();
  await page
    .getByRole("button", { name: "비밀번호 찾기", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "비밀번호 찾기",
    exact: true,
  });
  await dialog.getByLabel("이메일 또는 아이디", { exact: true }).fill(username);
  await dialog
    .getByLabel("인증 질문", { exact: true })
    .selectOption("secret_phrase");
  await dialog.getByLabel("인증 답변", { exact: true }).fill("틀린 답변");
  await dialog.getByLabel("복구코드", { exact: true }).fill(code);
  await dialog
    .getByRole("button", { name: "복구 정보 확인", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "복구 정보를 확인할 수 없습니다",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await fits(page);
  }
  await page.screenshot({
    path: `docs/screenshots/recovery-mobile-${info.project.name}.png`,
    animations: "disabled",
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByLabel("인증 답변", { exact: true }).fill(answer);
  await dialog
    .getByRole("button", { name: "복구 정보 확인", exact: true })
    .click();
  const next = dialog.getByLabel("새 비밀번호", { exact: true });
  await expect(next).toBeVisible();
  await next.fill("1234567");
  await dialog.getByLabel("새 비밀번호 확인", { exact: true }).fill("1234567");
  await dialog
    .getByRole("button", { name: "비밀번호 변경", exact: true })
    .click();
  await expect(next).toBeFocused();
  await next.fill(nextPassword);
  await dialog
    .getByLabel("새 비밀번호 확인", { exact: true })
    .fill(nextPassword);
  await dialog
    .getByRole("button", { name: "비밀번호 변경", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "비밀번호를 변경했어요" }),
  ).toBeVisible();
  await fits(page);
  expect(await acknowledgeCode(page, true)).not.toBe(code);
  expect(
    (await (await page.request.get("/api/auth/me")).json()).user,
  ).toBeNull();
  await page.getByLabel("로그인 계정", { exact: true }).fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드", exact: true }),
  ).toBeVisible();
});

test("existing accounts can register recovery with current password on desktop and mobile", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const account = await page.request.post("/api/auth/signup", {
    data: {
      email: `recovery-${randomUUID()}@example.test`,
      password,
    },
  });
  expect(account.status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "계정 설정", exact: true }).click();
  const section = page.getByRole("region", { name: "비밀번호 복구 설정" });
  await section
    .getByRole("button", { name: "복구 수단 등록", exact: true })
    .click();
  await section
    .getByLabel("현재 비밀번호", { exact: true })
    .fill("wrong-password");
  await section
    .getByLabel("인증 질문", { exact: true })
    .selectOption("memorable_place");
  await section.getByLabel("인증 답변", { exact: true }).fill(answer);
  await section.getByLabel("인증 답변 확인", { exact: true }).fill(answer);
  await section
    .getByRole("button", { name: "복구코드 발급", exact: true })
    .click();
  await expect(section.getByRole("alert")).toContainText("현재 비밀번호");
  await section.getByLabel("현재 비밀번호", { exact: true }).fill(password);
  await page.setViewportSize({ width: 320, height: 700 });
  await section
    .getByRole("button", { name: "복구코드 발급", exact: true })
    .scrollIntoViewIfNeeded();
  expect(await section.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `docs/screenshots/recovery-settings-mobile-${info.project.name}.png`,
    animations: "disabled",
  });
  await section
    .getByRole("button", { name: "복구코드 발급", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "복구코드를 보관해 주세요" }),
  ).toBeVisible();
  await fits(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await acknowledgeCode(page);
  await expect(section.getByText("설정 완료", { exact: true })).toBeVisible();
  await page.reload();
  const settings = await (
    await page.request.get("/api/auth/recovery-settings")
  ).json();
  expect(settings.configured).toBe(true);
  expect(settings.questionId).toBe("memorable_place");
  expect(settings.recoveryCode).toBeUndefined();
  expect(settings.answer).toBeUndefined();
});
