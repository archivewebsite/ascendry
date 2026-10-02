import { afterAll, describe, expect, it } from "vitest";
import seed from "@/data/catalog-seed.json";
import { closeCraftingOptimizerForTests, optimizeOrderBookPlan } from "@/lib/server/crafting-optimizer";
import { calculateOptimizedOrderBookCraft, calculateOptimizedOrderBookCraftFromBudget } from "@/lib/server/optimized-crafting";
import type { CatalogItem, CraftRequest, MarketListing } from "@/lib/types";

const market = (price: string | null) => ({ price, delta: { day: null, week: null, month: null }, snapshotAt: "2026-01-01T00:00:00.000Z", source: "local" as const });
const item = (id: number, idName: string, recipe: Array<[string, string]> = []): CatalogItem => ({
  id,
  idName,
  name: idName.toUpperCase(),
  emoji: "",
  imageUrl: null,
  description: null,
  baseValue: "1",
  craftable: recipe.length > 0,
  attributes: [],
  lootSources: [],
  recipe: recipe.map(([ingredientIdName, amount]) => ({ ingredientIdName, ingredientName: ingredientIdName.toUpperCase(), amount })),
  usedToCraft: [],
  market: market(null),
  mercantilistLevel: 0,
});
const listing = (id: string, itemId: number, price: string, amount: string): MarketListing => ({ id, bcId: "1", itemId, price, amount });
const request = (idName: string, quantity: string, orderBooks: Record<string, MarketListing[]>, overrides: Record<string, string> = {}): CraftRequest => ({
  idName,
  quantity,
  recipeMode: "optimized",
  priceMode: "orderbook",
  profile: { name: "Test", levels: { insider: 0, mercantilist: 61 } },
  manualPriceOverrides: overrides,
  orderBooks,
});

afterAll(async () => closeCraftingOptimizerForTests());

describe("quantity-aware crafting optimizer", () => {
  const basic = [item(1, "ore"), item(2, "bar", [["ore", "3"]]), item(3, "gear", [["bar", "2"]])];

  it("buys the final output when it is cheapest", async () => {
    const plan = await optimizeOrderBookPlan(request("gear", "2", {
      gear: [listing("g", 3, "20", "2")],
      bar: [listing("b", 2, "100", "4")],
      ore: [listing("o", 1, "100", "12")],
    }), basic);
    expect(plan.knownCost).toBe("40");
    expect(plan.decisions.find((entry) => entry.idName === "gear")).toMatchObject({ buyQuantity: "2", craftQuantity: "0" });
  });

  it("crafts the final output when ingredients are cheaper", async () => {
    const plan = await optimizeOrderBookPlan(request("gear", "2", {
      gear: [listing("g", 3, "100", "2")],
      bar: [listing("b", 2, "8", "4")],
      ore: [listing("o", 1, "100", "12")],
    }), basic);
    expect(plan.knownCost).toBe("32");
    expect(plan.decisions.find((entry) => entry.idName === "gear")).toMatchObject({ buyQuantity: "0", craftQuantity: "2" });
  });

  it("splits the output between buying and crafting across listing tiers", async () => {
    const mixedRequest = request("gear", "2", {
      gear: [listing("g1", 3, "5", "1"), listing("g2", 3, "100", "1")],
      bar: [listing("b", 2, "10", "4")],
      ore: [listing("o", 1, "100", "12")],
    });
    const plan = await optimizeOrderBookPlan(mixedRequest, basic);
    expect(plan.knownCost).toBe("25");
    expect(plan.decisions.find((entry) => entry.idName === "gear")).toMatchObject({ buyQuantity: "1", craftQuantity: "1" });
    const result = await calculateOptimizedOrderBookCraft(mixedRequest, basic);
    expect(result).toMatchObject({ recommendation: "mix", recommendationSummary: "Buy 1 and craft 1", selectedKnownTotal: "25", fulfilledQuantity: "2", unfilledQuantity: "0" });
    expect(result.shoppingList.map((line) => [line.idName, line.quantity])).toEqual([["bar", "2"], ["gear", "1"]]);
    expect(result.tree).toMatchObject({ action: "mix", buyQuantity: "1", craftQuantity: "1" });
  });

  it("shares limited cheap ingredients across recipe branches globally", async () => {
    const catalog = [
      item(1, "d"),
      item(2, "b", [["d", "1"]]),
      item(3, "c", [["d", "1"]]),
      item(4, "root", [["b", "1"], ["c", "1"]]),
    ];
    const plan = await optimizeOrderBookPlan(request("root", "1", {
      root: [listing("root", 4, "1000", "1")],
      b: [listing("b", 2, "10", "1")],
      c: [listing("c", 3, "100", "1")],
      d: [listing("d1", 1, "1", "1"), listing("d2", 1, "200", "1")],
    }), catalog);
    expect(plan.knownCost).toBe("11");
    expect(plan.decisions.find((entry) => entry.idName === "b")?.buyQuantity).toBe("1");
    expect(plan.decisions.find((entry) => entry.idName === "c")?.craftQuantity).toBe("1");
    expect(plan.decisions.find((entry) => entry.idName === "d")?.buyQuantity).toBe("1");
  });

  it("keeps very large quantities and costs exact", async () => {
    const catalog = [item(1, "raw"), item(2, "product", [["raw", "2"]])];
    const quantity = "1000000000000000000000000000000";
    const plan = await optimizeOrderBookPlan(request("product", quantity, {}, { raw: "3" }), catalog);
    expect(plan.complete).toBe(true);
    expect(plan.knownCost).toBe("6000000000000000000000000000000");
  });

  it("preserves one-BC differences when aggregate costs exceed safe doubles", async () => {
    const catalog = [item(1, "raw"), item(2, "product", [["raw", "1"]])];
    const plan = await optimizeOrderBookPlan(request("product", "2", {
      product: [
        listing("cheap", 2, "4503599627370496", "1"),
        listing("expensive", 2, "4503599627370497", "1"),
      ],
      raw: [listing("raw", 1, "4503599627370496", "2")],
    }), catalog);
    expect(plan.complete).toBe(true);
    expect(plan.knownCost).toBe("9007199254740992");
  });

  it("maximizes fulfilled output and reports the exact shortfall", async () => {
    const catalog = [item(1, "raw"), item(2, "product", [["raw", "2"]])];
    const plan = await optimizeOrderBookPlan(request("product", "2", { raw: [listing("r", 1, "3", "3")] }), catalog);
    expect(plan).toMatchObject({ fulfilledQuantity: "1", unfilledQuantity: "1", knownCost: "6", complete: false });
  });

  it("maximizes complete output under budget and then minimizes its cost", async () => {
    const budgetRequest = { ...request("gear", "1", {
      gear: [listing("g1", 3, "5", "1"), listing("g2", 3, "100", "1")],
      bar: [listing("b", 2, "10", "4")],
      ore: [listing("o", 1, "100", "12")],
    }), targetMode: "budget" as const, budget: "44" };
    const result = await calculateOptimizedOrderBookCraftFromBudget(budgetRequest, basic);
    expect(result.target.quantity).toBe("2");
    expect(result).toMatchObject({ recommendation: "mix", selectedKnownTotal: "25" });
    expect(result.budget).toEqual({ limit: "44", spent: "25", unspent: "19", averageUnitCost: "12", limitingFactor: "budget", nextUnitShortfall: "1" });
    expect(result.decisions?.find((entry) => entry.idName === "gear")).toMatchObject({ requiredQuantity: "2", buyQuantity: "1", craftQuantity: "1", unfilledQuantity: "0" });
  });

  it("supports every craftable item in the current catalog", async () => {
    const catalog: CatalogItem[] = seed.map((entry) => ({
      id: Number(entry.id),
      idName: entry.idName,
      name: entry.name,
      emoji: entry.emoji,
      imageUrl: entry.imageUrl ?? null,
      description: null,
      baseValue: String(entry.cost),
      craftable: !entry.uncraftable,
      attributes: entry.attributes,
      lootSources: entry.lootSources,
      recipe: entry.recipe.map(([ingredientIdName, amount]) => ({ ingredientIdName: String(ingredientIdName), ingredientName: String(ingredientIdName), amount: String(amount) })),
      usedToCraft: entry.usedToCraft,
      market: market(String(entry.cost)),
      mercantilistLevel: 0,
    }));
    const overrides = Object.fromEntries(catalog.map((entry) => [entry.idName, "1"]));
    const craftable = catalog.filter((entry) => entry.craftable);
    for (const entry of craftable) {
      const plan = await optimizeOrderBookPlan(request(entry.idName, "1", {}, overrides), catalog);
      expect(plan.complete, entry.name).toBe(true);
    }
    expect(craftable).toHaveLength(65);
  });
});
