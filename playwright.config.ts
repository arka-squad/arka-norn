import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/web",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    browserName: "chromium",
    bypassCSP: true,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: "test-results/web",
});
