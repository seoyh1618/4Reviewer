import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3188",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chrome", use: { channel: "chrome" } },
    {
      name: "webkit",
      testMatch: ["**/mobile-review-form.spec.ts", "**/order-ocr.spec.ts"],
      use: { browserName: "webkit" },
    },
  ],
  webServer: {
    command:
      "NODE_ENV=production API_RATE_LIMIT=2000 PORT=3188 DATABASE_PATH=./test-results/e2e.sqlite node server/index.mjs",
    url: "http://127.0.0.1:3188/api/health",
    reuseExistingServer: false,
    timeout: 20000,
  },
});
