import { expect, test } from "@playwright/test";

async function interfaceIconViolations(page: import("@playwright/test").Page) {
  return page.locator("svg").evaluateAll((icons) => icons.map((icon) => {
    const bounds = icon.getBoundingClientRect();
    const parent = icon.closest("button, a, [role=button], span, td, th");
    return {
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      label: parent?.getAttribute("aria-label") ?? parent?.textContent?.trim().slice(0, 40) ?? "unlabelled",
      chart: Boolean(icon.closest('[class*="recharts"]')),
    };
  }).filter((icon) => !icon.chart && !["Open Next.js Dev Tools", "Open issues overlay", "Collapse issues badge"].includes(icon.label) && (icon.width < 10 || icon.height < 10 || icon.width > 24 || icon.height > 24)));
}

test("loads the local catalog and navigates the main workspace", async ({ page }) => {
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Control bench" })).toBeVisible(); await expect(page.getByText("185", { exact: true }).first()).toBeVisible();
  const brandIcon = page.locator('[data-icon="tabler:circuit-switch-open"]');
  await expect(brandIcon).toBeVisible();
  await expect.poll(async () => brandIcon.evaluate((icon) => ({ width: icon.clientWidth, height: icon.clientHeight }))).toEqual({ width: 20, height: 20 });
  const collapseIcon = page.locator('[data-icon="tabler:chevrons-left"]');
  await expect(collapseIcon).toBeVisible();
  await expect.poll(async () => collapseIcon.evaluate((icon) => ({ width: icon.clientWidth, height: icon.clientHeight }))).toEqual({ width: 16, height: 16 });
  await expect.poll(async () => page.getByRole("button", { name: "Refresh market" }).locator("svg").evaluate((icon) => ({ width: icon.clientWidth, height: icon.clientHeight }))).toEqual({ width: 14, height: 14 });
  await page.getByRole("link", { name: /Market/ }).click(); await expect(page.getByRole("heading", { name: "Market matrix" })).toBeVisible(); await expect(page.getByRole("link", { name: /Rock/ }).first()).toBeVisible();
  const marketText = await page.locator("tbody").innerText();
  expect(marketText).not.toMatch(/<:[^:>]+:\d+>/);
  expect(marketText).not.toMatch(/\p{Extended_Pictographic}/u);
  await page.getByRole("link", { name: /Craft Lab/ }).click(); await expect(page.getByRole("heading", { name: "Craft Lab" })).toBeVisible();
  const itemOptions = await page.getByLabel("Output item").locator("option").allTextContents();
  expect(itemOptions.join(" ")).not.toMatch(/<:[^:>]+:\d+>|\p{Extended_Pictographic}/u);
});

test("keeps interface icons within the compact size scale on every route", async ({ page }) => {
  for (const route of ["/", "/market", "/craft?item=bricks", "/plans", "/prestige", "/settings", "/items/rock", "/design-guide"]) {
    await page.goto(route);
    await expect.poll(() => interfaceIconViolations(page), { message: `Oversized or collapsed interface icon on ${route}` }).toEqual([]);
  }
});
test("appearance and Prestige pages expose the complete controls", async ({ page }) => {
  await page.goto("/prestige"); await expect(page.getByText("Pyrology")).toBeVisible(); await expect(page.getByText("Quartermaster")).toBeVisible();
  await page.getByLabel("Insider level").fill("45"); await page.getByRole("button", { name: "Save profile" }).click(); await expect(page.getByText("Profile saved locally.")).toBeVisible();
  await page.goto("/settings"); await expect(page.getByRole("option", { name: "Ground Plane" })).toBeAttached(); await expect(page.getByText(/manual Depot price and stock quotes/)).toBeVisible();
  await page.getByLabel("Display mode").selectOption("dark"); await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
});

test("calculates all recipe modes, applies overrides, and saves a reproducible plan", async ({ page }) => {
  await page.goto("/craft?item=bricks");
  await page.getByLabel("Quantity").fill("2 * 3");
  await page.getByRole("button", { name: "Direct", exact: true }).click();
  await page.getByRole("button", { name: "Order-book depth" }).click();
  await page.getByRole("button", { name: "Calculate plan" }).click();
  await expect(page.getByText(/This is an incomplete lower bound/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Lowest listing" }).click();
  for (const input of await page.getByLabel(/Manual price for/).all()) await input.fill("10");
  await page.getByRole("button", { name: "Calculate plan" }).click();
  await expect(page.getByText("Selected total")).toBeVisible();
  await page.getByRole("button", { name: "Craft all" }).click(); await page.getByRole("button", { name: "Calculate plan" }).click(); await expect(page.getByText(/recursive path/)).toBeVisible();
  await page.getByRole("button", { name: "Lowest cost" }).click(); await page.getByRole("button", { name: "Find lowest cost" }).click(); await expect(page.getByText(/optimized path/)).toBeVisible();
  await page.getByLabel("Plan name").fill("E2E Bricks Plan"); await page.getByRole("button", { name: "Save plan" }).click(); await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.goto("/plans"); await expect(page.getByText("E2E Bricks Plan", { exact: true }).first()).toBeVisible();
});

test("builds from an exact budget and supports the primary keyboard shortcuts", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Shift+/");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeHidden();

  await page.keyboard.press("g"); await page.keyboard.press("m");
  await expect(page.getByRole("heading", { name: "Market matrix" })).toBeVisible();
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search")).toBeFocused();
  await page.getByLabel("Search").blur();

  await page.keyboard.press("g"); await page.keyboard.press("c");
  await expect(page.getByRole("heading", { name: "Craft Lab" })).toBeVisible();
  await page.getByLabel("Output item").selectOption("grandhall");
  await page.getByRole("button", { name: "Budget", exact: true }).click();
  await page.getByLabel("Budget").fill("5.11t");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("region", { name: "Budget result" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Items produced", { exact: true })).toBeVisible();
  await expect(page.getByText("Spent", { exact: true })).toBeVisible();
  await expect(page.getByText("Unspent", { exact: true })).toBeVisible();

  await page.getByLabel("Plan name").fill("E2E Budget Plan");
  await page.keyboard.press("Control+Shift+S");
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.getByLabel("Plan name").blur();

  for (const [key, heading] of [["p", "Scenario plans"], ["r", "Prestige profiles"], ["s", "Settings"], ["d", "Control bench"]] as const) {
    await page.keyboard.press("g"); await page.keyboard.press(key);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("creates an alert and exposes it in the dashboard watchlist", async ({ page }) => {
  await page.goto("/items/rock");
  await page.getByLabel("Alert price").fill("100"); await page.getByRole("button", { name: "Save alert" }).click();
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Watchlist" })).toBeVisible(); await expect(page.getByText("Rock", { exact: true }).first()).toBeVisible();
});

test("calculates boss damage and ascension without a live API connection", async ({ page }) => {
  await page.goto("/calculators/boss-damage");
  await expect(page.getByLabel("Weapon").locator("option", { hasText: "Rusty Knife" })).toBeAttached();
  await page.getByLabel("Weapon").selectOption({ label: "Rusty Knife" });
  await page.getByLabel("Pricing mode").selectOption({ label: "Base price" });
  await page.getByLabel(/Boss HP remaining/).fill("1001");
  await page.getByLabel(/Hit weakpoint/).check();
  await page.getByRole("button", { name: "Calculate attack" }).click();
  await expect(page.getByText("1,200", { exact: true })).toBeVisible();
  await expect(page.getByText("199", { exact: true })).toBeVisible();

  await page.goto("/calculators/ascension");
  await page.getByRole("button", { name: "Calculate ascension" }).click();
  await expect(page.getByText("3,320,213,540 BC", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Ascend Tier 0 → 1/)).toHaveCount(0);

  await page.goto("/players");
  await expect(page.getByRole("heading", { name: "Open a live player record" })).toBeVisible();
});

test("keeps the active mobile destination visible without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/players", "/calculators/ascension", "/calculators/boss-damage", "/settings"]) {
    await page.goto(route);
    const active = page.locator('nav [aria-current="page"]');
    await expect(active).toBeVisible();
    await expect.poll(() => active.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true);
  }
});
