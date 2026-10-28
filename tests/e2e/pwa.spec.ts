import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function signedIn(page: Page) {
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email: `pwa-${randomUUID()}@example.test`,
      password: "ReviewPass-1234",
      signupCode: "3333",
    },
  });
  expect(response.status()).toBe(201);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
}

test("manifest, Apple icon and production worker make the app installable", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute("content", "yes");
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    short_name: "포 리뷰어",
  });
  for (const [url, size] of [
    ["/icons/app-192.png", 192],
    ["/icons/app-512.png", 512],
    ["/icons/apple-touch-icon.png", 180],
  ] as const) {
    const icon = await page.request.get(url);
    const bytes = await icon.body();
    expect(icon.status()).toBe(200);
    expect(icon.headers()["content-type"]).toContain("image/png");
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cdp = await context.newCDPSession(page);
  const result = await cdp.send("Page.getAppManifest");
  expect(result.errors).toEqual([]);
  await expect
    .poll(async () =>
      // Playwright's isolated context is incognito. Ignore that browser-mode
      // restriction, while still failing every application installability error.
      (
        await cdp.send("Page.getInstallabilityErrors")
      ).installabilityErrors.filter(
        (error) => error.errorId !== "in-incognito",
      ),
    )
    .toEqual([]);
});

test("offline launch shows a connection notice without caching account pages or APIs", async ({
  page,
  context,
}) => {
  await signedIn(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(cached).toEqual(["/offline.html"]);
  await context.setOffline(true);
  const apiFailed = await page.evaluate(async () => {
    try {
      await fetch("/api/auth/me");
      return false;
    } catch {
      return true;
    }
  });
  expect(apiFailed).toBe(true);
  await page.goto("/?view=products");
  await expect(
    page.getByRole("heading", { name: "인터넷 연결을 확인해 주세요" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "내 계정", exact: true }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await page.getByRole("link", { name: "다시 연결" }).click();
  await expect(
    page.getByRole("heading", { name: "리뷰 대시보드" }),
  ).toBeVisible();
});

test.describe("phone installation guide", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });
  test("iPhone manual installation is reachable from the account without layout overflow", async ({
    page,
  }, testInfo) => {
    await signedIn(page);
    await page.getByRole("button", { name: "내 계정", exact: true }).click();
    await page
      .getByRole("dialog", { name: "내 계정", exact: true })
      .getByRole("button", { name: "앱 설치", exact: true })
      .click();
    const guide = page.getByRole("dialog", {
      name: "포 리뷰어 앱 설치",
      exact: true,
    });
    await expect(guide).toBeVisible();
    await expect(
      guide.getByText("아이폰·아이패드", { exact: true }),
    ).toBeVisible();
    await expect(
      guide.getByText("홈 화면에 추가", { exact: true }),
    ).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const bounds = await guide.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await expect(
        guide.getByRole("button", { name: "닫기", exact: true }).last(),
      ).toBeInViewport();
    }
    await page.screenshot({ path: testInfo.outputPath("iphone-install.png") });
    await guide
      .getByRole("button", { name: "닫기", exact: true })
      .last()
      .click();
    await expect(
      page.getByRole("dialog", { name: "내 계정", exact: true }),
    ).toBeVisible();
  });
});

test("browser install prompt handles cancellation, retry and actual install event", async ({
  page,
}) => {
  await signedIn(page);
  await page.getByRole("button", { name: "앱 설치", exact: true }).click();
  const guide = page.getByRole("dialog", {
    name: "포 리뷰어 앱 설치",
    exact: true,
  });
  for (const outcome of ["dismissed", "accepted"] as const) {
    await page.evaluate((choice) => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: choice }),
      });
      window.dispatchEvent(event);
    }, outcome);
    await guide.getByRole("button", { name: "이 기기에 설치" }).click();
    await expect(guide.getByRole("status")).toContainText(
      outcome === "dismissed" ? "설치를 취소했어요" : "설치 요청을 보냈어요",
    );
    await expect(
      guide.getByRole("button", { name: "이 기기에 설치" }),
    ).toHaveCount(0);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page
      .getByRole("dialog", { name: "포 리뷰어 웹앱", exact: true })
      .getByRole("status"),
  ).toContainText("앱으로 사용할 준비가 됐어요");
});
