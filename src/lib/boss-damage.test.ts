import { describe, expect, it } from "vitest";
import { bountiesForBaseDamage, calculateWeaponQuantity, effectiveDamage, quantityForBounties, weaponsFromCatalog } from "@/lib/boss-damage";
import type { CatalogItem } from "@/lib/types";

describe("boss damage", () => {
  it("keeps reward damage separate from multipliers", () => {
    expect(effectiveDamage(200n, 15_000n, true)).toBe(600n);
    expect(bountiesForBaseDamage(4_000_000n)).toBe(1n);
  });

  it("finds the first integer quantity that reaches a bounty target", () => {
    const quantity = quantityForBounties(200n, 1n);
    expect(quantity).toBe(1n);
    expect(quantityForBounties(200n, 2n)).toBe(20_001n);
  });

  it("uses effective damage to kill while reporting base-damage rewards", () => {
    const result = calculateWeaponQuantity({ mode: "kill-boss", weaponDamage: 200n, bossHp: 1_001n, targetBounties: 0n, multiplierBps: 10_000n, weakpoint: true });
    expect(result.quantity).toBe(3n);
    expect(result.effectiveDamage).toBe(1_200n);
    expect(result.baseDamage).toBe(600n);
    expect(result.overkill).toBe(199n);
  });
  it("uses synced weapon damage and includes newly added weapons", () => {
    const catalog = [
      { idName: "rustyknife", name: "Rusty Knife", weaponDamage: "250" },
      { idName: "newweapon", name: "New Weapon", weaponDamage: "9007199254740993" },
    ] as CatalogItem[];
    expect(weaponsFromCatalog(catalog)).toEqual([
      { idName: "rustyknife", name: "Rusty Knife", damage: 250n },
      { idName: "newweapon", name: "New Weapon", damage: 9007199254740993n },
    ]);
  });
});
