import { describe, expect, it } from "vitest";
import { MERCANTILIST_UNLOCKS, PRESTIGE_PERKS, TOTAL_MAX_PRESTIGE_LEVELS, requiredMercantilistLevel, validatePrestigeLevels } from "@/lib/prestige";
describe("Prestige reference data", () => {
  it("contains the complete live-manual set", () => { expect(PRESTIGE_PERKS).toHaveLength(28); expect(TOTAL_MAX_PRESTIGE_LEVELS).toBe(888); });
  it("provides complete plain-English copy for every perk", () => {
    expect(new Set(PRESTIGE_PERKS.map((perk) => perk.key)).size).toBe(28);
    for (const perk of PRESTIGE_PERKS) {
      expect(perk.description).toMatch(/[.!]$/);
      expect(perk.effect.trim()).not.toBe("");
      expect(perk.maxLevel).toBeGreaterThan(0);
    }
    expect(PRESTIGE_PERKS.filter((perk) => perk.calculationRelevant).map((perk) => perk.key)).toEqual(["mercantilist", "insider"]);
  });
  it("keeps exact Mercantilist boundary mappings", () => { expect(MERCANTILIST_UNLOCKS).toHaveLength(62); expect(requiredMercantilistLevel("Seaweed")).toBe(0); expect(requiredMercantilistLevel("Hunter's Blind")).toBe(60); expect(requiredMercantilistLevel("Low Orbit Ion Cannon")).toBe(61); });
  it("validates individual ranges without a Rune budget", () => { expect(() => validatePrestigeLevels({ menager: 200, virility: 100 })).not.toThrow(); expect(() => validatePrestigeLevels({ insider: 46 })).toThrow(); });
});
