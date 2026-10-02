import { describe, expect, it } from "vitest";
import { normalizeStoredProfiles } from "@/lib/client/prestige-profiles";

describe("browser-local Prestige profiles", () => {
  it("caps valid stored profiles at three and fills omitted perks with zero", () => {
    const profiles = normalizeStoredProfiles([1, 2, 3, 4].map((number) => ({ id: String(number), name: `Profile ${number}`, levels: { insider: number } })));
    expect(profiles).toHaveLength(3);
    expect(profiles[0]?.levels.pyrology).toBe(0);
  });

  it("falls back safely when a stored perk exceeds its live range", () => {
    const profiles = normalizeStoredProfiles([{ id: "bad", name: "Bad", levels: { insider: 46 } }]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.id).toBe("main");
    expect(profiles[0]?.levels.insider).toBe(0);
  });
});
