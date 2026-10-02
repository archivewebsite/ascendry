import { describe, expect, it } from "vitest";
import { calculateCraft, calculateCraftFromBudget, shoppingListToCsv } from "@/lib/crafting";
import type { CatalogItem, CraftRequest } from "@/lib/types";

const market = (price: string | null) => ({ price, delta: { day: null, week: null, month: null }, snapshotAt: "2026-01-01T00:00:00.000Z", source: "local" as const });
const items: CatalogItem[] = [
  { id: 1, idName: "ore", name: "Ore", emoji: "", imageUrl: null, description: null, baseValue: "1", craftable: false, attributes: [], lootSources: [], recipe: [], usedToCraft: ["bar"], market: market("4"), mercantilistLevel: 0 },
  { id: 2, idName: "bar", name: "Bar", emoji: "", imageUrl: null, description: null, baseValue: "1", craftable: true, attributes: [], lootSources: [], recipe: [{ ingredientIdName: "ore", ingredientName: "Ore", amount: "3" }], usedToCraft: ["gear"], market: market("10"), mercantilistLevel: 1 },
  { id: 3, idName: "gear", name: "Gear", emoji: "", imageUrl: null, description: null, baseValue: "1", craftable: true, attributes: [], lootSources: [], recipe: [{ ingredientIdName: "bar", ingredientName: "Bar", amount: "2" }], usedToCraft: [], market: market("30"), mercantilistLevel: 2 },
];
const request: CraftRequest = { idName: "gear", quantity: "2", recipeMode: "recursive", priceMode: "lowest", profile: { name: "Test", levels: { insider: 0, mercantilist: 61 } }, manualPriceOverrides: {} };

describe("crafting engine", () => {
  it("keeps direct mode at immediate ingredients", () => { const result = calculateCraft({ ...request, recipeMode: "direct" }, items); expect(result.shoppingList).toEqual([expect.objectContaining({ idName: "bar", quantity: "4", lowestCost: "40" })]); });
  it("expands recursively and consolidates raw materials", () => { const result = calculateCraft(request, items); expect(result.shoppingList).toHaveLength(1); expect(result.shoppingList[0]?.quantity).toBe("12"); expect(result.selectedKnownTotal).toBe("48"); });
  it("chooses the cheaper buy path in optimized mode", () => { const result = calculateCraft({ ...request, recipeMode: "optimized" }, items); expect(result.shoppingList[0]?.idName).toBe("bar"); expect(result.shoppingList[0]?.quantity).toBe("4"); expect(result.selectedKnownTotal).toBe("40"); });
  it("marks missing prices as an incomplete lower bound and accepts overrides", () => { const missing = items.map((item) => item.idName === "ore" ? { ...item, market: market(null) } : item); expect(calculateCraft(request, missing).complete).toBe(false); const custom = calculateCraft({ ...request, manualPriceOverrides: { ore: "9" } }, missing); expect(custom.complete).toBe(true); expect(custom.custom).toBe(true); });
  it("keeps lowest-price completeness separate from an incomplete order book", () => {
    const orderBooks = { ore: [{ id: "1", bcId: "1", itemId: 1, price: "5", amount: "7" }] };
    expect(calculateCraft({ ...request, priceMode: "lowest", orderBooks }, items).complete).toBe(true);
    const depth = calculateCraft({ ...request, priceMode: "orderbook", orderBooks }, items);
    expect(depth.complete).toBe(false);
    expect(depth.orderBookUnfilled.ore).toBe("5");
  });
  it("treats live order-book depth as complete even without a saved lowest price", () => {
    const noSavedPrice = items.map((item) => item.idName === "ore" ? { ...item, market: market(null) } : item);
    const orderBooks = { ore: [{ id: "1", bcId: "1", itemId: 1, price: "5", amount: "12" }] };
    const result = calculateCraft({ ...request, priceMode: "orderbook", orderBooks }, noSavedPrice);
    expect(result.complete).toBe(true);
    expect(result.selectedKnownTotal).toBe("60");
    expect(result.missingPrices).toEqual([]);
  });
  it("uses monotonic search for lowest and fillable order-book budget capacity", () => {
    const orderBooks = { ore: [{ id: "1", bcId: "1", itemId: 1, price: "5", amount: "100" }] };
    const result = calculateCraft({ ...request, priceMode: "orderbook", orderBooks, budget: "100" }, items);
    expect(result.budgetCapacity).toEqual({ lowest: "4", orderBook: "3" });
  });
  it("builds the maximum complete lowest-listing plan from an exact budget", () => {
    const result = calculateCraftFromBudget({ ...request, targetMode: "budget", budget: "100" }, items);
    expect(result.target.quantity).toBe("4");
    expect(result.selectedKnownTotal).toBe("96");
    expect(result.budget).toEqual({ limit: "100", spent: "96", unspent: "4", averageUnitCost: "24", limitingFactor: "budget", nextUnitShortfall: "20" });
  });
  it("returns zero complete items and the exact shortfall when the budget is too small", () => {
    const result = calculateCraftFromBudget({ ...request, targetMode: "budget", budget: "10" }, items);
    expect(result.target.quantity).toBe("0");
    expect(result.shoppingList).toEqual([]);
    expect(result.budget).toMatchObject({ spent: "0", unspent: "10", averageUnitCost: null, nextUnitShortfall: "14" });
  });
  it("distinguishes finite order-book depth from a budget limit", () => {
    const orderBooks = { ore: [{ id: "1", bcId: "1", itemId: 1, price: "5", amount: "18" }] };
    const result = calculateCraftFromBudget({ ...request, targetMode: "budget", priceMode: "orderbook", orderBooks, budget: "1000" }, items);
    expect(result.target.quantity).toBe("3");
    expect(result.budget).toMatchObject({ spent: "90", unspent: "910", limitingFactor: "market-depth", nextUnitShortfall: null });
  });
  it("rejects recipe cycles and missing ingredient references", () => {
    const cycle = items.map((item) => item.idName === "ore" ? { ...item, craftable: true, recipe: [{ ingredientIdName: "gear", ingredientName: "Gear", amount: "1" }] } : item);
    expect(() => calculateCraft(request, cycle)).toThrow(/cycle/i);
    const missing = items.map((item) => item.idName === "bar" ? { ...item, recipe: [{ ingredientIdName: "unknown", ingredientName: "Unknown", amount: "1" }] } : item);
    expect(() => calculateCraft(request, missing)).toThrow(/unknown/i);
  });
  it("exports a quoted CSV", () => expect(shoppingListToCsv(calculateCraft(request, items))).toContain('"Ore","ore","12"'));
});
