import { describe, expect, it } from "vitest";
import { estimateDepot, normalizeMonitoredProfiles, planRestrictedCraft, restrictedMode } from "@/lib/restricted-tracker";
import type { CatalogItem } from "@/lib/types";

const item = (idName: string, recipe: Array<[string, string]> = []): CatalogItem => ({
  id: ["ore", "bar", "plate", "machine"].indexOf(idName) + 1,
  idName, name: idName, emoji: "", imageUrl: null, description: null, baseValue: "1",
  craftable: recipe.length > 0, attributes: [], lootSources: idName === "ore" ? ["Mine"] : [],
  recipe: recipe.map(([ingredientIdName, amount]) => ({ ingredientIdName, ingredientName: ingredientIdName, amount })),
  usedToCraft: [], market: null, mercantilistLevel: null,
});
const catalog = [item("ore"), item("bar", [["ore", "3"]]), item("plate", [["ore", "4"]]), item("machine", [["bar", "2"], ["plate", "1"]])];

describe("restricted profile tracker", () => {
  it("recognizes only supported profile modes", () => {
    expect(restrictedMode("Ironman")).toBe("ironman");
    expect(restrictedMode("HARDCORE")).toBe("hardcore");
    expect(restrictedMode("main")).toBeNull();
  });

  it("uses shared inventory once across recursive branches", () => {
    const plan = planRestrictedCraft("machine", "1", catalog, { bar: "1", ore: "5" });
    expect(plan.ownedUsed).toEqual(expect.arrayContaining([{ idName: "bar", name: "bar", quantity: "1" }, { idName: "ore", name: "ore", quantity: "5" }]));
    expect(plan.deficits).toEqual([{ idName: "ore", name: "ore", quantity: "2", lootSources: ["Mine"] }]);
    expect(plan.craftSteps).toEqual(expect.arrayContaining([{ idName: "machine", name: "machine", quantity: "1" }, { idName: "bar", name: "bar", quantity: "1" }, { idName: "plate", name: "plate", quantity: "1" }]));
  });

  it("does not craft when the target is already owned", () => {
    const plan = planRestrictedCraft("machine", "2", catalog, { machine: "2" });
    expect(plan.craftSteps).toEqual([]);
    expect(plan.deficits).toEqual([]);
  });

  it("keeps unquoted and out-of-stock materials outstanding", () => {
    const plan = planRestrictedCraft("machine", "1", catalog, {});
    expect(estimateDepot(plan, { ore: { price: "7", stock: "4" } })).toEqual({ knownCost: "28", covered: "4", outstanding: "6" });
    expect(estimateDepot(plan, {})).toEqual({ knownCost: "0", covered: "0", outstanding: "10" });
  });

  it("caps restored monitoring to two distinct profiles", () => {
    const snapshot = (bcId: string) => ({ bcId, mode: "ironman", refreshedAt: "2026-01-01", inventory: {}, stats: {}, trophies: [] });
    const stored = ["1", "1", "2", "3"].map((bcId) => ({ bcId, latest: snapshot(bcId) }));
    expect(normalizeMonitoredProfiles(stored).map((entry) => entry.bcId)).toEqual(["1", "2"]);
  });
});
