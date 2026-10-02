import { describe, expect, it } from "vitest";
import seed from "@/data/catalog-seed.json";
import { itemDataSchema, listingSchema, marketPreviewSchema } from "@/lib/server/schemas";
describe("Bconomy contracts", () => {
  it("accepts the sanitized catalog fixture", () => expect(itemDataSchema.parse(seed)).toHaveLength(185));
  it("preserves oversized market integers as strings", () => { const result = marketPreviewSchema.parse({ lastUpdated: 1, data: { rock: { price: "9007199254740993000", delta: { day: 1, week: null, month: -2 } } } }); expect(result.data.rock?.price).toBe("9007199254740993000"); });
  it("coerces known-small fields emitted as strings by the exact-number parser", () => {
    const raw = seed.map((item) => ({
      ...item,
      id: String(item.id),
      cost: String(item.cost),
      recipe: item.recipe.map(([idName, amount]) => [idName, String(amount)]),
    }));
    const items = itemDataSchema.parse(raw);
    const preview = marketPreviewSchema.parse({ lastUpdated: "1789586239142", data: { rock: { price: "50", delta: { day: "0", week: "2", month: null } } } });
    expect(items[0]?.id).toBe(0);
    expect(items[0]?.cost).toBe("50");
    expect(preview.data.rock?.delta).toEqual({ day: 0, week: 2, month: null });
  });
  it("retains exact weapon damage from the item feed", () => {
    const raw = structuredClone(seed);
    raw.find((entry) => entry.idName === "rustyknife")!.damage = "9007199254740993" as never;
    const items = itemDataSchema.parse(raw);
    expect(items.find((entry) => entry.idName === "rustyknife")?.damage).toBe("9007199254740993");
  });
  it("rejects malformed catalog references", () => { const broken = structuredClone(seed); broken[0]!.recipe = [["missing-item", 1]] as never; broken[0]!.uncraftable = false; expect(() => itemDataSchema.parse(broken)).toThrow(); });
  it("rejects recipe backlinks that disagree with ingredient usage", () => { const broken = structuredClone(seed); broken.find((item) => item.idName === "rock")!.usedToCraft = []; expect(() => itemDataSchema.parse(broken)).toThrow(/backlinks/i); });
  it("rejects invalid market depth before it reaches a cost calculation", () => {
    const listing = { id: "1", bcId: "1", itemId: "5", price: "50", amount: "2" };
    expect(() => listingSchema.parse([{ ...listing, amount: "-2" }])).toThrow();
    expect(() => listingSchema.parse([{ ...listing, price: "-50" }])).toThrow();
    expect(() => listingSchema.parse([listing, listing])).toThrow(/Duplicate listing id/);
  });
  it("rejects negative base values and zero recipe amounts", () => {
    const badCost = structuredClone(seed);
    badCost[0]!.cost = -1;
    expect(() => itemDataSchema.parse(badCost)).toThrow();
    const badRecipe = structuredClone(seed);
    const craftable = badRecipe.find((entry) => entry.recipe.length > 0)!;
    craftable.recipe[0]![1] = 0;
    expect(() => itemDataSchema.parse(badRecipe)).toThrow();
  });
});
