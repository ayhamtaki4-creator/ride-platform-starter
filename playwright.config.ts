import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const apiURL = process.env.E2E_API_URL ?? "http://127.0.0.1:4000/api";
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: "test-results",
  timeout: 40_000,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    locale: "ar-SA",
    timezoneId: "Asia/Amman",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: "pnpm --filter api dev",
          url: `${apiURL.replace(/\/api\/?$/, "")}/api/health`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "pnpm --filter portal dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
