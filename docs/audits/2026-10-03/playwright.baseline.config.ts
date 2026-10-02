import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../../../e2e", fullyParallel: false, workers: 1,
  timeout: 30_000, expect: { timeout: 5_000 },
  reporter: [["list"], ["json", { outputFile: "repair-browser-baseline.json" }]],
  outputDir: "test-results/repair-baseline",
  use: { baseURL: process.env.ASCENDRY_E2E_BASE_URL },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
