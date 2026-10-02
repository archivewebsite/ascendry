// Browser regressions converted from the original audit's forensic checks.
import { expect, test } from "@playwright/test";

test("F18: manual price fields remain editable and can complete a plan", async ({ page }) => {
  await page.goto("/craft?item=bricks");
  await page.getByRole("button", { name: "Direct", exact: true }).click();
  await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
  const prices = page.getByLabel(/Manual price for/);
  await expect(prices.first()).toBeVisible();
  const count = await prices.count();
  await prices.first().pressSequentially("125");
  await expect(prices).toHaveCount(count);
  await expect(prices.first()).toHaveValue("125");
  for (const price of await prices.all()) await price.fill("10");
  await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
  await expect(page.getByText("Selected total", { exact: true })).toBeVisible();
  await expect(prices).toHaveCount(count);
  await prices.first().fill("");
  await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
  await expect(page.getByText("Selected known subtotal", { exact: true })).toBeVisible();
});

test("control: direct budget plans correctly mark unknown supply incomplete", async ({ request }) => {
  const response = await request.post("/api/craft/calculate", { data: { idName: "bricks", targetMode: "budget", budget: "100", recipeMode: "direct", priceMode: "orderbook", profile: { name: "Audit", levels: {} }, manualPriceOverrides: {} } });
  expect(response.status()).toBe(200);
  const value = await response.json();
  // This serves as a control: direct mode correctly marks unknown supply incomplete.
  expect(value.result.complete).toBe(false);
  expect(value.result.target.quantity).toBe("0");
});

test("F20: runtime HTTP requests from a foreign origin cannot mutate the local database", async ({ request }) => {
  const response = await request.post("/api/plans", { headers: { Origin: "https://foreign.example", "Content-Type": "text/plain" }, data: JSON.stringify({ name: "Foreign audit plan", payload: {}, result: {} }) });
  expect(response.status()).toBe(403);
  const plans = await (await request.get("/api/plans")).json();
  expect(plans.plans.some((plan: { name: string }) => plan.name === "Foreign audit plan")).toBe(false);
  for (const url of ["/api/connection", "/api/history", "/api/plans/unknown", "/api/watchlist/unknown"]) {
    expect((await request.delete(url, { headers: { Origin: "https://foreign.example" } })).status()).toBe(403);
  }
  expect((await request.post("/api/backup", { headers: { Origin: "https://foreign.example" }, data: { schemaVersion: 1 } })).status()).toBe(403);
  expect((await request.post("/api/sync", { headers: { Origin: "https://foreign.example" } })).status()).toBe(403);
});

test("F21: failed disconnect displays an error and keeps the connection visible", async ({ page }) => {
  await page.route("**/api/connection", async (route) => {
    if (route.request().method() === "DELETE") await route.fulfill({ status: 500, json: { error: "Cannot remove credential" } });
    else await route.fulfill({ json: { connected: true, diagnostics: { items: 185, recipes: 1, market_snapshots: 0, plans: 0, alerts: 0, lastSyncSuccess: null, lastSyncError: null, catalogSource: "audit" } } });
  });
  await page.goto("/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText("Cannot remove credential")).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect", exact: true })).toBeVisible();
});

test("F22: zero manual prices reach the engine and invalid quantities return client errors", async ({ request }) => {
  const response = await request.post("/api/craft/calculate", { data: { idName: "bricks", quantity: "1", recipeMode: "direct", priceMode: "lowest", profile: { name: "Audit", levels: {} }, manualPriceOverrides: { rock: "0" } } });
  expect(response.status()).toBe(200);
  expect((await response.json()).request.manualPriceOverrides.rock).toBe("0");
  const invalid = await request.post("/api/craft/calculate", { data: { idName: "bricks", quantity: "1,,0", recipeMode: "direct", priceMode: "lowest", profile: { name: "Audit", levels: {} }, manualPriceOverrides: {} } });
  expect(invalid.status()).toBe(400);
});

test("F23: denied browser storage keeps the app usable and reports unsaved changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage blocked by audit", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked by audit", "SecurityError"); };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Control bench" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByText(/Sidebar preference changed.*could not be saved/)).toBeVisible();
  await page.goto("/prestige");
  await page.getByLabel("Insider level").fill("5");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Changes are available.*could not be saved/)).toBeVisible();
  await expect(page.getByText("Profile saved locally.")).toHaveCount(0);
  await page.goto("/tracker");
  await expect(page.getByText(/Tracker changes.*could not be saved/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("F24: blank profile names are rejected and existing levels survive reload", async ({ page }) => {
  await page.goto("/prestige");
  await page.getByLabel("Insider level").fill("5");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved locally.")).toBeVisible();
  await page.getByLabel("Profile name", { exact: true }).fill("");
  await page.getByLabel("Insider level").fill("6");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Enter a profile name before saving.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Insider level")).toHaveValue("5");
});

test("F26: legacy Craft Lab exports can be imported into Plans", async ({ page, request }) => {
  const itemResponse = await request.get("/api/items/bricks");
  const { item } = await itemResponse.json();
  const resultResponse = await request.post("/api/craft/calculate", { data: { idName: "bricks", quantity: "1", recipeMode: "direct", priceMode: "lowest", profile: { name: "Audit", levels: {} }, manualPriceOverrides: Object.fromEntries(item.recipe.map((ingredient: { ingredientIdName: string }) => [ingredient.ingredientIdName, "1"])) } });
  expect(resultResponse.status()).toBe(200);
  const exported = await resultResponse.json();
  await page.goto("/plans");
  await page.getByLabel("Choose plan file").setInputFiles({ name: "ascendry-plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByText("Bricks × 1", { exact: true }).first()).toBeVisible();
});

test("F26: an actual Craft Lab download round-trips through Plans", async ({ page }) => {
  await page.goto("/craft?item=bricks");
  await page.getByRole("button", { name: "Direct", exact: true }).click();
  await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
  await expect(page.getByLabel(/Manual price for/).first()).toBeVisible();
  for (const price of await page.getByLabel(/Manual price for/).all()) await price.fill("10");
  await page.getByRole("button", { name: "Calculate plan", exact: true }).click();
  await expect(page.getByText("Selected total", { exact: true })).toBeVisible();
  await page.getByLabel("Plan name").fill("Downloaded regression plan");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const file = await downloaded;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  await page.goto("/plans");
  await page.getByLabel("Choose plan file").setInputFiles({ name: "ascendry-plan.json", mimeType: "application/json", buffer: Buffer.concat(chunks) });
  await expect(page.getByText("Downloaded regression plan", { exact: true })).toBeVisible();
});

test("F21: backup import and history deletion failures are visible", async ({ page }) => {
  await page.route("**/api/backup", (route) => route.fulfill({ status: 422, json: { error: "Backup was rejected" } }));
  await page.route("**/api/history", (route) => route.fulfill({ status: 500, json: { error: "Cannot remove history" } }));
  await page.goto("/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Choose backup file").setInputFiles({ name: "bad-backup.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByText("Backup was rejected")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove history", exact: true }).click();
  await expect(page.getByText("Cannot remove history")).toBeVisible();
});

test("F21: plan deletion, duplication, and recalculation failures are visible", async ({ page, request }) => {
  const result = await (await request.post("/api/craft/calculate", { data: { idName: "bricks", quantity: "1", recipeMode: "direct", priceMode: "lowest", profile: { name: "Audit", levels: {} }, manualPriceOverrides: {} } })).json();
  const created = await (await request.post("/api/plans", { data: { name: "Operation failure fixture", payload: { ...result.request, marketSnapshotAt: result.result.marketSnapshotAt }, result: result.result } })).json();
  await page.route("**/api/plans", (route) => route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "Cannot duplicate plan" } }) : route.continue());
  await page.route("**/api/plans/*", (route) => route.fulfill({ status: 500, json: { error: "Cannot delete plan" } }));
  await page.route("**/api/craft/calculate", (route) => route.fulfill({ status: 500, json: { error: "Cannot recalculate plan" } }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/plans");
  const card = page.locator("section").filter({ has: page.getByText("Operation failure fixture", { exact: true }) });
  await card.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByText("Cannot duplicate plan")).toBeVisible();
  await card.getByRole("button", { name: "Current perks", exact: true }).click();
  await expect(page.getByText("Cannot recalculate plan")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Cannot delete plan")).toBeVisible();
  await expect(page.getByText("Operation failure fixture", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await request.delete(`/api/plans/${created.plan.id}`);
});

test("F09: monitoring canonicalizes leading-zero IDs and survives reload", async ({ page }) => {
  const latest = { bcId: "1", name: "Canonical tracker fixture", mode: "ironman", refreshedAt: "2026-10-01T00:00:00.000Z", tier: "1", rank: "1", questLevel: "1", bc: "0", inventory: {}, stats: {}, trophies: [] };
  await page.route("**/api/players/1/tracker", (route) => route.fulfill({ json: latest }));
  await page.goto("/tracker");
  await page.getByLabel("BcID", { exact: true }).fill("001");
  await page.getByRole("button", { name: "Monitor profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: latest.name })).toBeVisible();
  await page.getByLabel("BcID", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Monitor profile", exact: true }).click();
  await expect(page.getByText("That profile is already monitored.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: latest.name })).toBeVisible();
});
