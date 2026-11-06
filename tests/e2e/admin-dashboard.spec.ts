import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import AxeBuilder from "@axe-core/playwright";
import { today } from "../../shared/domain.mjs";

async function membership(id: string, grant: boolean) {
  if (process.env.DATABASE_URL) {
    const connectionString = process.env.TEST_DATABASE_ADMIN_URL;
    if (
      !connectionString ||
      !new URL(connectionString).pathname.endsWith("_test")
    )
      throw new Error("An isolated test DB operator is required");
    const pool = new pg.Pool({
      connectionString,
      options: "-c search_path=reviewer,pg_catalog",
    });
    try {
      if (grant)
        await pool.query(
          "INSERT INTO admin_memberships(user_id,granted_at,granted_by) VALUES($1,$2,'e2e-operator')",
          [id, new Date().toISOString()],
        );
      else
        await pool.query("DELETE FROM admin_memberships WHERE user_id=$1", [
          id,
        ]);
    } finally {
      await pool.end();
    }
  } else {
    const db = new DatabaseSync("test-results/e2e.sqlite");
    try {
      if (grant)
        db.prepare(
          "INSERT INTO admin_memberships(user_id,granted_at,granted_by) VALUES(?,?,'e2e-operator')",
        ).run(id, new Date().toISOString());
      else db.prepare("DELETE FROM admin_memberships WHERE user_id=?").run(id);
    } finally {
      db.close();
    }
  }
}
for (const width of [390, 1440])
  test(`administrator dashboard, member detail and access control at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const username = `admin_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    const signup = await page.request.post("/api/auth/signup", {
      data: { username, password: "BrowserTest1234" },
    });
    expect(signup.status()).toBe(201);
    const user = (await signup.json()).user;
    await page.goto("/admin");
    await expect(
      page.getByText("이 계정에는 관리자 접근 권한이 없습니다."),
    ).toBeVisible();
    expect((await page.request.get("/api/admin/dashboard")).status()).toBe(403);
    await membership(user.id, true);
    try {
      for (const [i, platform] of ["쿠팡", "네이버", "11번가"].entries()) {
        const saved = await page.request.post("/api/reviews", {
          data: {
            name: `운영 화면 테스트 상품 ${i + 1}`,
            platform,
            shippingMethod: "빈박스",
            price: 10000 + i * 1000,
            additionalReviewFee: 1000,
            reviewType: "사진 리뷰",
            reviewStatus: i === 0 ? "done" : "todo",
            reviewedAt: i === 0 ? today() : "",
            purchaseDate: today(),
            receivedAmount: i === 0 ? 11000 : 0,
            paidAt: i === 0 ? today() : "",
          },
        });
        expect(saved.status()).toBe(201);
      }
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "회원과 리뷰, 한눈에." }),
      ).toBeVisible();
      await expect(page.locator(".admin-kpis")).toBeVisible();
      await expect(page.locator(".admin-trend svg")).toBeVisible();
      await page.getByLabel("추이 날짜 선택").selectOption(today());
      await expect(page.locator(".admin-chart-values")).toContainText("활성");
      await page.getByText("일별 데이터 보기", { exact: true }).click();
      await expect(page.locator(".admin-data-alternative table")).toBeVisible();
      await page.getByText("일별 데이터 보기", { exact: true }).click();
      await page.getByLabel("회원 검색", { exact: true }).fill(username);
      await page.getByRole("button", { name: "검색", exact: true }).click();
      await expect(page.locator(".admin-pagination")).toContainText("1명");
      if (width < 720) {
        await expect(page.locator(".admin-member-desktop")).toBeHidden();
        await page.locator(".admin-member-card").click();
      } else
        await page
          .locator(".admin-member-link")
          .filter({ hasText: username })
          .click();
      const dialog = page.getByRole("dialog", { name: "회원별 이용 내역" });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("운영 화면 테스트 상품 1", { exact: true }),
      ).toBeVisible();
      await expect(dialog.locator(".admin-detail-kpis")).toContainText(
        "11,000원",
      );
      const detailAxe = await new AxeBuilder({ page })
        .include(".admin-detail-modal")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(detailAxe.violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`admin-detail-${width}.png`),
        fullPage: true,
      });
      await dialog
        .getByRole("button", { name: "닫기", exact: true })
        .last()
        .click();
      await page.getByLabel("회원 필터").selectOption("new");
      await expect(page.locator(".admin-pagination")).toContainText("1명");
      await page.getByLabel("회원 정렬").selectOption("received");
      await expect(page).toHaveURL(/adminSort=received/);
      await page.getByLabel("조회 월").fill("2024-02");
      await expect(
        page.getByRole("heading", { name: "2월 신규 가입", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("조건에 맞는 회원이 없습니다."),
      ).toBeVisible();
      await page.getByLabel("조회 월").fill(today().slice(0, 7));
      await expect(page.locator(".admin-pagination")).toContainText("1명");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const axe = await new AxeBuilder({ page })
        .include(".admin-app")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(axe.violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`admin-dashboard-${width}.png`),
        fullPage: true,
      });
      await membership(user.id, false);
      await page.getByRole("button", { name: "관리자 현황 새로고침" }).click();
      await expect(
        page.getByText("이 계정에는 관리자 접근 권한이 없습니다."),
      ).toBeVisible();
      await expect(page.locator(".admin-kpis")).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await membership(user.id, false);
    }
  });
