import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.ASCENDRY_E2E_BASE_URL ?? "http://127.0.0.1:3210",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
