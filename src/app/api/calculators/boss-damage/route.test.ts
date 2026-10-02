import { describe, expect, it, vi } from "vitest";
import type { CatalogItem } from "@/lib/types";

const weapon: CatalogItem = {
  id: 1,
  idName: "stungun",
  name: "Stun Gun",
  emoji: "",
  imageUrl: null,
  description: null,
  baseValue: "1331700",
  craftable: true,
  attributes: [],
  lootSources: [],
  recipe: [{ ingredientIdName: "rock", ingredientName: "Rock", amount: "2" }],
  usedToCraft: [],
  market: null,
  mercantilistLevel: null,
};

const ingredient: CatalogItem = {
  ...weapon,
  id: 2,
  idName: "rock",
  name: "Rock",
  baseValue: "5",
  craftable: false,
  recipe: [],
};

vi.mock("@/lib/server/credential", () => ({ loadApiKey: async () => "test-key" }));
vi.mock("@/lib/server/db", () => ({ getCatalog: () => [weapon, ingredient] }));
vi.mock("@/lib/server/bconomy", () => ({
  fetchGameValues: async () => ({}),
  fetchListings: async (_key: string, itemId: number) => [{ id: "1", bcId: "9", itemId, price: itemId === 1 ? "100" : "5", amount: "10" }],
  fetchUserInventory: async () => ({}),
  fetchGameState: async () => ({}),
}));

import { POST } from "./route";

describe("boss damage API", () => {
  it.each(["market", "direct", "recursive"])("returns JSON-safe %s pricing details", async (pricingMode) => {
    const response = await POST(new Request("http://localhost/api/calculators/boss-damage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "kill-boss",
        weapon: "stungun",
        pricingMode,
        bossHp: "1000000",
        targetBounties: "10000000",
        multiplierBps: "10000",
        weakpoint: false,
        buddyLevel: 0,
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.best.quantity).toBe("1");
    expect(body.best.complete).toBe(true);
    expect(body.best.cost).toBe(body.best.knownCost);
    expect(body.best.details).toBeTruthy();
    expect(typeof (body.best.details.cost ?? body.best.details.knownCost)).toBe("string");
  });

  it("does not report a partial order-book subtotal as the total acquisition cost", async () => {
    const response = await POST(new Request("http://localhost/api/calculators/boss-damage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "kill-boss",
        weapon: "stungun",
        pricingMode: "market",
        bossHp: "100000000",
        targetBounties: "10000000",
        multiplierBps: "10000",
        weakpoint: false,
        buddyLevel: 0,
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.best).toMatchObject({
      quantity: "16",
      acquire: "16",
      complete: false,
      cost: null,
      knownCost: "1000",
      pricedQuantity: "10",
      unpricedQuantity: "6",
    });
  });

  it("uses synced catalog damage when calculating weapon quantity", async () => {
    weapon.weaponDamage = "2000000";
    try {
      const response = await POST(new Request("http://localhost/api/calculators/boss-damage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "kill-boss", weapon: "stungun", pricingMode: "base",
          bossHp: "10000000", targetBounties: "10000000",
          multiplierBps: "10000", weakpoint: false, buddyLevel: 0,
        }),
      }));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.best).toMatchObject({ baseDamagePerWeapon: "2000000", quantity: "5" });
    } finally {
      weapon.weaponDamage = undefined;
    }
  });
});
