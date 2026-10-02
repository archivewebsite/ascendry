import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOSTER_ITEMS } from "@/lib/boosters";
import { fetchListings } from "@/lib/server/bconomy";
import { getCache, getCatalog } from "@/lib/server/db";
import type { CatalogItem } from "@/lib/types";

vi.mock("@/lib/server/credential", () => ({ loadApiKey: vi.fn(async () => "test-key") }));
vi.mock("@/lib/server/db", () => ({ getCatalog: vi.fn(), getCache: vi.fn(() => null), putCache: vi.fn() }));
vi.mock("@/lib/server/bconomy", () => ({ fetchListings: vi.fn() }));

import { POST } from "./route";

const selectedIds = BOOSTER_ITEMS.explore.map(({ idName }) => idName);
const base: CatalogItem = {
  id: 99, idName: "ore", name: "Ore", emoji: "", imageUrl: null, description: null, baseValue: "1",
  craftable: false, attributes: [], lootSources: [], recipe: [], usedToCraft: [], market: null, mercantilistLevel: null,
};
const catalog: CatalogItem[] = [
  ...BOOSTER_ITEMS.explore.map(({ idName, name }, index) => ({
    ...base, id: index + 1, idName, name, craftable: index === 1,
    recipe: index === 1 ? [{ ingredientIdName: "ore", ingredientName: "Ore", amount: "2" }] : [],
  })),
  base,
];

describe("booster market API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCatalog).mockReturnValue(catalog);
    vi.mocked(getCache).mockReturnValue(null);
    vi.mocked(fetchListings).mockImplementation(async (_key, itemId) => [{ id: `listing-${itemId}`, bcId: "1", itemId, price: "10", amount: "100" }]);
  });

  it("loads direct recipe ingredients and uncraftable booster listings", async () => {
    const response = await POST(new Request("http://localhost/api/calculators/boosters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: selectedIds }) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(6);
    expect(body.catalog.some((item: CatalogItem) => item.idName === "ore")).toBe(true);
    expect(body.orderBooks.ore).toHaveLength(1);
    expect(body.orderBooks.downyparka).toBeUndefined();
    expect(vi.mocked(fetchListings).mock.calls.map(([, itemId]) => itemId).sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 6, 99]);
  });

  it("rejects an item in the wrong tier", async () => {
    const response = await POST(new Request("http://localhost/api/calculators/boosters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: ["fishfinder", ...selectedIds.slice(1)] }) }));
    expect(response.status).toBe(400);
    expect(fetchListings).not.toHaveBeenCalled();
  });

  it("bypasses the one-minute listing cache on an explicit refresh", async () => {
    vi.mocked(getCache).mockReturnValue([]);
    const response = await POST(new Request("http://localhost/api/calculators/boosters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: selectedIds, force: true }) }));
    expect(response.status).toBe(200);
    expect(fetchListings).toHaveBeenCalledTimes(6);
  });
});
