// Regression checks converted from the original audit's forensic reproductions.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import seed from "@/data/catalog-seed.json";
import { calculateCraft } from "@/lib/crafting";
import { parseQuantityExpression } from "@/lib/quantity";
import { normalizeMonitoredProfiles, planRestrictedCraft } from "@/lib/restricted-tracker";
import { normalizeStoredProfiles } from "@/lib/client/prestige-profiles";
import { itemDataSchema, marketPreviewSchema } from "@/lib/server/schemas";
import * as db from "@/lib/server/db";
import { closeCraftingOptimizerForTests, optimizeOrderBookPlan } from "@/lib/server/crafting-optimizer";
import type { CatalogItem, CraftRequest } from "@/lib/types";
import { parsePlanImport } from "@/lib/plan-schema";

const upstream = vi.hoisted(() => ({ loadApiKey: vi.fn(), fetchListings: vi.fn(), fetchPriceHistory: vi.fn(), fetchTransactions: vi.fn(), fetchVolumeHistory: vi.fn(), fetchGameValues: vi.fn(), fetchUserInventory: vi.fn(), fetchGameState: vi.fn() }));
vi.mock("@/lib/server/credential", () => ({ loadApiKey: upstream.loadApiKey }));
vi.mock("@/lib/server/bconomy", async (original) => ({ ...await original<typeof import("@/lib/server/bconomy")>(), ...upstream }));

const directories: string[] = [];
beforeEach(() => {
  db.closeDatabaseForTests();
  const directory = mkdtempSync(path.join(tmpdir(), "ascendry-audit-"));
  directories.push(directory);
  process.env.ASCENDRY_DATA_DIR = directory;
  vi.resetAllMocks();
  upstream.loadApiKey.mockResolvedValue(null);
  upstream.fetchListings.mockResolvedValue([]);
  upstream.fetchTransactions.mockResolvedValue([]);
  upstream.fetchPriceHistory.mockResolvedValue([]);
  upstream.fetchVolumeHistory.mockResolvedValue([]);
  upstream.fetchGameValues.mockResolvedValue({});
  upstream.fetchUserInventory.mockResolvedValue({});
  upstream.fetchGameState.mockResolvedValue({});
});
afterAll(async () => {
  await closeCraftingOptimizerForTests();
  db.closeDatabaseForTests();
  delete process.env.ASCENDRY_DATA_DIR;
  for (const directory of directories) {
    if (!directory.startsWith(path.resolve(tmpdir()) + path.sep + "ascendry-audit-")) throw new Error("Unexpected audit directory.");
    rmSync(directory, { recursive: true, force: true });
  }
});

function item(id: number, idName: string, price: string | null = null, recipe: Array<[string, string]> = []): CatalogItem {
  return { id, idName, name: idName, emoji: "", imageUrl: null, description: null, baseValue: "1", craftable: recipe.length > 0, attributes: [], lootSources: [], recipe: recipe.map(([ingredientIdName, amount]) => ({ ingredientIdName, ingredientName: ingredientIdName, amount })), usedToCraft: [], market: { price, delta: { day: null, week: null, month: null }, snapshotAt: "2026-10-01T00:00:00.000Z", source: "local" }, mercantilistLevel: 0 };
}
const craftRequest = (idName: string): CraftRequest => ({ idName, quantity: "1", recipeMode: "optimized", priceMode: "lowest", profile: { name: "Audit", levels: {} }, manualPriceOverrides: {} });
function preview(lastUpdated: string, price: string) { return marketPreviewSchema.parse({ lastUpdated, data: { rock: { price, delta: { day: null, week: null, month: null } } } }); }
const jsonRequest = (url: string, value: unknown, headers: Record<string, string> = {}) => new Request(`http://127.0.0.1:3000${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) });

function validPlan() {
  const payload = { ...craftRequest("bricks"), recipeMode: "direct" as const, marketSnapshotAt: null,
    manualPriceOverrides: Object.fromEntries(db.getItem("bricks")!.recipe.map((ingredient) => [ingredient.ingredientIdName, "1"])) };
  return { name: "Regression plan", payload, result: calculateCraft(payload, db.getCatalog()) };
}

describe.sequential("audit regression checks", () => {
  it("F01: malformed backup plan JSON is rejected without changing valid plans", () => {
    const saved = db.savePlan(validPlan());
    expect(() => db.importBackup({ schemaVersion: 1, plans: [{ id: "bad", name: "bad", payload_json: "{", result_json: "{}", created_at: "2026-10-01", updated_at: "2026-10-01" }] })).toThrow();
    expect(db.listPlans()).toEqual([saved]);
  });
  it("F01: invalid imported snapshot dates leave catalog reads intact", () => {
    expect(() => db.importBackup({ schemaVersion: 1, snapshots: [{ id: 1, upstream_updated_at: "invalid-time", captured_at: "2026-10-01" }] })).toThrow();
    expect(db.getCatalog()).toHaveLength(185);
    expect(db.exportBackup().snapshots).toEqual([]);
  });
  it("F02: older arrivals cannot replace newer prices and equivalent timestamps deduplicate", () => {
    db.storeSync(itemDataSchema.parse(seed), preview("2026-10-02T00:00:00Z", "100"));
    db.storeSync(itemDataSchema.parse(seed), preview("2026-10-01T00:00:00Z", "25"));
    expect(db.getItem("rock")?.market?.price).toBe("100");
    expect(db.localPriceHistory("rock").map((point) => point.lowestPrice)).toEqual(["25", "100"]);
    expect(db.storeSync(itemDataSchema.parse(seed), preview(String(Date.parse("2026-10-02T00:00:00Z")), "100")).inserted).toBe(false);
  });
  it("control: reintroduced items correctly retain a null missing price", () => {
    const omitted = seed.filter((entry) => entry.idName !== "daoicseal").map((entry) => ({ ...entry, usedToCraft: entry.usedToCraft.filter((name) => name !== "daoicseal") }));
    const market = preview("2026-10-01T00:00:00Z", "25");
    db.storeSync(itemDataSchema.parse(omitted), market);
    db.storeSync(itemDataSchema.parse(seed), market);
    expect(db.getItem("daoicseal")?.market?.price).toBeNull();
    expect(calculateCraft(craftRequest("daoicseal"), db.getCatalog()).complete).toBe(false);
  });
  it("F04: the plans endpoint rejects structurally empty plans", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(jsonRequest("/api/plans", { name: "Invalid", payload: {}, result: {} }));
    expect(response.status).toBe(422);
    expect(db.listPlans()).toEqual([]);
  });
  it("F05: incomplete optimized plans report unavailable fulfillment", () => {
    const result = calculateCraft(craftRequest("output"), [item(1, "raw"), item(2, "output", null, [["raw", "1"]])]);
    expect(result).toMatchObject({ complete: false, fulfilledQuantity: "0", unfilledQuantity: "1", recommendation: "unavailable", recommendationSummary: "No complete priced path" });
  });
  it("F06: complete lowest-price shopping rows have no false shortage", () => {
    const result = calculateCraft({ ...craftRequest("output"), recipeMode: "direct" }, [item(1, "raw", "5"), item(2, "output", "20", [["raw", "3"]])]);
    expect(result.complete).toBe(true);
    expect(result.shoppingList[0]).toMatchObject({ filledQuantity: "3", unfilledQuantity: "0" });
  });
  it("F07: corrupted tracker integers are rejected", () => {
    const profiles = normalizeMonitoredProfiles([{ bcId: "1", latest: { bcId: "1", mode: "ironman", refreshedAt: "2026-10-01", inventory: {}, stats: {}, trophies: [], tier: "not-a-number", rank: "1", questLevel: "1", bc: "0" } }]);
    expect(profiles).toHaveLength(0);
  });
  it("F08: every catalog craft sequence orders prerequisites before consumers", () => {
    const catalog = [item(1, "ore"), item(2, "bar", null, [["ore", "1"]]), item(3, "plate", null, [["bar", "1"]]), item(4, "machine", null, [["bar", "1"], ["plate", "1"]])];
    const plan = planRestrictedCraft("machine", "1", catalog, { ore: "2" });
    expect(plan.craftSteps.map((step) => step.idName)).toEqual(["bar", "plate", "machine"]);
    const liveCatalog = db.getCatalog();
    const byId = new Map(liveCatalog.map((entry) => [entry.idName, entry]));
    const invalid = liveCatalog.filter((entry) => entry.craftable).filter((entry) => {
      const sequence = planRestrictedCraft(entry.idName, "1", liveCatalog, {}).craftSteps;
      const positions = new Map(sequence.map((step, index) => [step.idName, index]));
      return sequence.some((step, index) => byId.get(step.idName)!.recipe.some((ingredient) => (positions.get(ingredient.ingredientIdName) ?? -1) >= index));
    });
    expect(invalid).toHaveLength(0);
  });
  it("F09: leading-zero monitored IDs canonicalize and deduplicate", () => {
    const latest = { bcId: "1", mode: "ironman", refreshedAt: "2026-10-01", inventory: {}, stats: {}, trophies: [] };
    expect(normalizeMonitoredProfiles([{ bcId: "001", latest }, { bcId: "1", latest }]).map((entry) => entry.bcId)).toEqual(["1"]);
  });
  it("F10: malformed comma grouping is rejected", () => {
    expect(() => parseQuantityExpression("1,,0")).toThrow(/grouping/);
    expect(() => parseQuantityExpression("1,2")).toThrow(/grouping/);
    expect(parseQuantityExpression("1,200 * 2")).toBe(2400n);
  });
  it("F11: invalid history days never reach upstream calls", async () => {
    upstream.loadApiKey.mockResolvedValue("audit-mock-key");
    const { GET } = await import("@/app/api/items/[idName]/market/route");
    const context = { params: Promise.resolve({ idName: "rock" }) };
    for (const days of ["1.5", "abc", "0", "401", ""]) expect((await GET(new Request(`http://127.0.0.1:3000/api/items/rock/market?days=${days}`), context)).status).toBe(400);
    expect(upstream.fetchPriceHistory).not.toHaveBeenCalled();
    expect((await GET(new Request("http://127.0.0.1:3000/api/items/rock/market?days=2"), context)).status).toBe(200);
    expect(upstream.fetchPriceHistory).toHaveBeenCalledWith("audit-mock-key", 0, 2);
  });
  it("F12: oversized boss inventory IDs are rejected", async () => {
    upstream.loadApiKey.mockResolvedValue("audit-mock-key");
    const { POST } = await import("@/app/api/calculators/boss-damage/route");
    const response = await POST(jsonRequest("/api/calculators/boss-damage", { mode: "kill-boss", weapon: "rustyknife", pricingMode: "base", bossHp: "100", targetBounties: "1", multiplierBps: "10000", weakpoint: false, buddyLevel: 0, bcId: "9007199254740993" }));
    expect(response.status).toBe(400);
    expect(upstream.fetchUserInventory).not.toHaveBeenCalled();
  });
  it("F13: base-price calculations fall back offline with a saved key", async () => {
    upstream.loadApiKey.mockResolvedValue("audit-mock-key");
    upstream.fetchGameValues.mockRejectedValueOnce(new Error("offline"));
    const { POST } = await import("@/app/api/calculators/boss-damage/route");
    const response = await POST(jsonRequest("/api/calculators/boss-damage", { mode: "kill-boss", weapon: "rustyknife", pricingMode: "base", bossHp: "100", targetBounties: "1", multiplierBps: "10000", weakpoint: false, buddyLevel: 0 }));
    expect(response.status).toBe(200);
    expect((await response.json()).constantsSource).toBe("defaults");
  });
  it("F14: changing an alert condition clears its old trigger", () => {
    const alert = db.saveAlert({ idName: "rock", direction: "below", threshold: "30", enabled: true });
    db.storeSync(itemDataSchema.parse(seed), preview("2026-10-01T00:00:00Z", "25"));
    db.saveAlert({ ...alert, idName: "iron", direction: "above", threshold: "50000" });
    expect(db.getAlert(alert.id)).toMatchObject({ idName: "iron", triggeredPrice: null, triggeredAt: null });
  });
  it("F15: duplicate Prestige IDs cannot create ambiguous profiles", () => {
    expect(normalizeStoredProfiles([{ id: "same", name: "One", levels: {} }, { id: "same", name: "Two", levels: {} }, { id: "valid", name: "Valid", levels: { insider: 5 } }]).map((profile) => profile.id)).toEqual(["same", "valid"]);
  });
  it("F16: dangling backup prices cause explicit rejection", () => {
    expect(() => db.importBackup({ schemaVersion: 1, snapshots: [], prices: [{ snapshot_id: 999, id_name: "rock", price: "50", delta_day: null, delta_week: null, delta_month: null }] })).toThrow(/missing snapshot/);
    expect(db.exportBackup().prices).toEqual([]);
  });
  it("F17: cross-origin and non-JSON writes are rejected while same-origin plans work", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(jsonRequest("/api/plans", validPlan(), { Origin: "https://foreign.example", "Content-Type": "text/plain" }));
    expect(response.status).toBe(403);
    expect(db.listPlans()).toEqual([]);
    expect((await POST(jsonRequest("/api/plans", validPlan(), { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(jsonRequest("/api/plans", validPlan(), { Origin: "http://127.0.0.1:3000" }))).status).toBe(201);
    expect((await POST(jsonRequest("/api/plans", validPlan(), { Host: "127.0.0.1:45678", Origin: "http://127.0.0.1:45678" }))).status).toBe(201);
    expect((await POST(jsonRequest("/api/plans", validPlan(), { Host: "rebound.example:45678", Origin: "http://rebound.example:45678" }))).status).toBe(403);
  });
  it("control: the fast optimizer retains one-BC optimality inside its safe-number envelope", async () => {
    const catalog = [item(1, "raw"), item(2, "output", null, [["raw", "1"]])];
    for (const price of [1_000_000n, 1_000_000_000n, 1_000_000_000_000n, 100_000_000_000_000n, 1_000_000_000_000_000n, 4_000_000_000_000_000n]) {
      for (const cheaper of ["raw", "output"]) {
        const book = (id: string, itemId: number) => [{ id, bcId: "1", itemId, amount: "1", price: (price + (id === cheaper ? 0n : 1n)).toString() }];
        const result = await optimizeOrderBookPlan({ ...craftRequest("output"), priceMode: "orderbook", orderBooks: { raw: book("raw", 1), output: book("output", 2) } }, catalog);
        expect(result.knownCost, `${price}/${cheaper}`).toBe(price.toString());
      }
    }
  });
  it("F25: fully manual order-book plans do not decrypt credentials", async () => {
    const target = db.getItem("bricks")!;
    upstream.loadApiKey.mockRejectedValueOnce(new Error("credential decryption failed"));
    const { POST } = await import("@/app/api/craft/calculate/route");
    const response = await POST(jsonRequest("/api/craft/calculate", { ...craftRequest("bricks"), recipeMode: "direct", priceMode: "orderbook", manualPriceOverrides: Object.fromEntries(target.recipe.map((entry) => [entry.ingredientIdName, "1"])) }));
    expect(response.status).toBe(200);
    expect((await response.json()).result.complete).toBe(true);
    expect(upstream.loadApiKey).not.toHaveBeenCalled();
  });
  it("F25: cached order books work without decrypting a credential", async () => {
    upstream.loadApiKey.mockRejectedValueOnce(new Error("credential decryption failed"));
    for (const ingredient of db.getItem("bricks")!.recipe) {
      const item = db.getItem(ingredient.ingredientIdName)!;
      db.putCache(`listings:${item.id}:${item.idName}`, [{ id: item.idName, bcId: "1", itemId: item.id, amount: "10000", price: "1" }], 60_000);
    }
    const { POST } = await import("@/app/api/craft/calculate/route");
    expect((await POST(jsonRequest("/api/craft/calculate", { ...craftRequest("bricks"), recipeMode: "direct", priceMode: "orderbook" }))).status).toBe(200);
    expect(upstream.loadApiKey).not.toHaveBeenCalled();
  });
  it("F26: legacy Craft Lab exports and versioned Plans exports round-trip", () => {
    const plan = validPlan();
    const legacy = parsePlanImport({ request: plan.payload, result: plan.result });
    expect(legacy[0]?.result).toEqual(plan.result);
    const saved = db.savePlan(legacy[0]!);
    expect(parsePlanImport({ schemaVersion: 1, plans: [saved] })[0]?.payload).toEqual(plan.payload);
    db.importBackup(db.exportBackup());
    expect(db.listPlans()).toEqual([saved]);
  });
  it("F01/F16: rejects bad numeric fields and mixed valid/invalid backup rows atomically", () => {
    const plan = validPlan();
    const saved = db.savePlan(plan);
    const backup = db.exportBackup();
    backup.snapshots.push({ id: 1, upstream_updated_at: "2026-10-01", captured_at: "2026-10-01" });
    backup.prices.push({ snapshot_id: 1, id_name: "rock", price: "not-a-number", delta_day: null, delta_week: null, delta_month: null });
    backup.plans[0]!.name = "Must not be committed";
    expect(() => db.importBackup(backup)).toThrow();
    expect(db.listPlans()).toEqual([saved]);
    expect(db.exportBackup().snapshots).toEqual([]);
  });
  it("F04: invalid plan updates do not replace existing valid plans", async () => {
    const saved = db.savePlan(validPlan());
    const { PUT } = await import("@/app/api/plans/[id]/route");
    const response = await PUT(new Request(`http://127.0.0.1:3000/api/plans/${saved.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Invalid", payload: {}, result: {} }) }), { params: Promise.resolve({ id: saved.id }) });
    expect(response.status).toBe(422);
    expect(db.getPlan(saved.id)).toEqual(saved);
  });
  it("F07: restoration keeps good tracker entries and drops broken nested snapshots and quotes", () => {
    const latest = { bcId: "2", mode: "hardcore", refreshedAt: "2026-10-01", inventory: { rock: "9007199254740993" }, stats: {}, trophies: ["first"] };
    const profiles = normalizeMonitoredProfiles([{ bcId: "1", latest: { ...latest, bcId: "1", tier: "bad" } },
      { bcId: "2", latest, previous: { ...latest, bc: "bad" }, depotQuotes: { rock: { price: "5", stock: "2" }, bad: { price: {}, stock: "2" } } }]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ bcId: "2", latest: { tier: "0", inventory: latest.inventory }, previous: null, depotQuotes: { rock: { price: "5", stock: "2" } } });
    expect(profiles[0]!.depotQuotes.bad).toBeUndefined();
  });
  it("F13: optional live reference failures preserve the weapon list", async () => {
    upstream.loadApiKey.mockResolvedValue("audit-mock-key");
    upstream.fetchGameState.mockRejectedValueOnce(new Error("offline"));
    upstream.fetchGameValues.mockRejectedValueOnce(new Error("offline"));
    const { GET } = await import("@/app/api/calculators/boss-damage/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.weapons.length).toBeGreaterThan(0);
    expect(body.warning).toBeTruthy();
    expect(body.gameValues).toBeNull();
  });
  it("F13: inventory failures still fail an inventory-dependent base-price calculation", async () => {
    upstream.loadApiKey.mockResolvedValue("audit-mock-key");
    upstream.fetchUserInventory.mockRejectedValueOnce(new Error("Inventory unavailable"));
    const { POST } = await import("@/app/api/calculators/boss-damage/route");
    const response = await POST(jsonRequest("/api/calculators/boss-damage", { mode: "kill-boss", weapon: "rustyknife", pricingMode: "base", bossHp: "100", targetBounties: "1", multiplierBps: "10000", weakpoint: false, buddyLevel: 0, bcId: "1" }));
    expect(response.status).toBe(500);
  });
  it("F15/F24: invalid profiles do not erase independent valid saved levels", () => {
    const profiles = normalizeStoredProfiles([{ id: "bad", name: "", levels: { insider: 5 } }, { id: "good", name: "Good", levels: { insider: 5 } }]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: "good", levels: { insider: 5 } });
  });
});
