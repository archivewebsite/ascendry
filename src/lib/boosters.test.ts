import { describe, expect, it } from "vitest";
import { durationForItems, formatDuration, itemsForDuration, parseWholeNumber, quoteBoosterBasket, quoteBoosterCost } from "@/lib/boosters";
import type { CatalogItem } from "@/lib/types";

const material: CatalogItem = {
  id: 1, idName: "ore", name: "Ore", emoji: "", imageUrl: null, description: null, baseValue: "1",
  craftable: false, attributes: [], lootSources: [], recipe: [], usedToCraft: [], market: null, mercantilistLevel: null,
};
const booster: CatalogItem = {
  ...material, id: 2, idName: "booster", name: "Booster", craftable: true,
  recipe: [{ ingredientIdName: "ore", ingredientName: "Ore", amount: "2" }],
};

describe("booster duration calculator", () => {
  it("converts 6,000 T2 items into 125 days", () => {
    const seconds = durationForItems(6000n, 30);
    expect(seconds).toBe(10_800_000n);
    expect(formatDuration(seconds)).toBe("0 years · 4 months · 5 days · 0 hours · 0 minutes · 0 seconds");
    expect(itemsForDuration(seconds, 30)).toBe(6000n);
  });

  it("rounds up whole items for a target and handles exact and zero targets", () => {
    expect(itemsForDuration(3601n, 60)).toBe(2n);
    expect(itemsForDuration(3600n, 60)).toBe(1n);
    expect(itemsForDuration(0n, 60)).toBe(0n);
  });

  it("parses whole counts exactly and rejects malformed input", () => {
    expect(parseWholeNumber("6,000")).toBe(6000n);
    expect(parseWholeNumber("9007199254740993")).toBe(9007199254740993n);
    expect(parseWholeNumber("")).toBe(0n);
    expect(parseWholeNumber("1,00")).toBeNull();
    expect(parseWholeNumber("1.5")).toBeNull();
    expect(parseWholeNumber("-2")).toBeNull();
  });

  it("prices direct crafting ingredients across listings and flags missing supply", () => {
    const listings = [
      { id: "1", bcId: "1", itemId: 1, price: "10", amount: "2" },
      { id: "2", bcId: "2", itemId: 1, price: "15", amount: "3" },
    ];
    expect(quoteBoosterCost(booster, 2n, [booster, material], { ore: listings })).toMatchObject({ method: "Craft", cost: 50n, estimate: 40n, unfilled: [] });
    expect(quoteBoosterCost(booster, 3n, [booster, material], { ore: listings })).toMatchObject({ method: "Craft", cost: null, estimate: 60n, knownCost: 65n, unfilled: [{ name: "Ore", quantity: 1n }] });
    expect(quoteBoosterCost(material, 1n, [material], { ore: listings })).toMatchObject({ method: "Buy", cost: 10n, estimate: 10n });
    expect(quoteBoosterCost(booster, 1n, [booster, material], { ore: [] })).toMatchObject({ cost: null, estimate: null });
  });

  it("combines shared ingredients before pricing several booster tiers", () => {
    const second = { ...booster, id: 3, idName: "secondbooster", name: "Second Booster" };
    const catalog = [booster, second, material];
    const books = { ore: [{ id: "1", bcId: "1", itemId: 1, price: "10", amount: "3" }] };
    const quotes = [quoteBoosterCost(booster, 1n, catalog, books), quoteBoosterCost(second, 1n, catalog, books)];
    expect(quotes.map((quote) => quote.cost)).toEqual([20n, 20n]);
    expect(quoteBoosterBasket(quotes, books)).toMatchObject({ cost: null, estimate: 40n, knownCost: 30n, unfilled: [{ name: "Ore", quantity: 1n }] });
  });
});
