import { describe, expect, it } from "vitest";
import { ascendCost, calculateAscensionTarget, calculateMaxAffordable, rankUpCost } from "@/lib/ascension";

describe("ascension calculations", () => {
  it("matches the current rank-cost table", () => {
    expect(rankUpCost(0, 2)).toBe(21_920n);
    expect(rankUpCost(1, 2)).toBe(43_840n);
    expect(rankUpCost(0, 58)).toBe(200_000_000n);
    expect(rankUpCost(0, 2, 20)).toBe(10_960n);
  });

  it("makes the first ascension free and scales later ascensions", () => {
    expect(ascendCost(0)).toBe(0n);
    expect(ascendCost(1)).toBe(1_650_000_000n);
    expect(ascendCost(2)).toBe(2_200_000_000n);
    expect(ascendCost(1, 20)).toBe(825_000_000n);
  });

  it("matches the tier-zero full rank total", () => {
    const result = calculateAscensionTarget({ tier: 0, rank: 1 }, { tier: 0, rank: 58 }, 0n, { nepotism: 0, anointment: 0 });
    expect(result.totalCost).toBe("3320213540");
    expect(result.shortfall).toBe("3320213540");
    expect(result).not.toHaveProperty("segments");
  });

  it("walks through a free first ascension", () => {
    const result = calculateMaxAffordable({ tier: 0, rank: 58 }, 21_920n * 2n, { nepotism: 0, anointment: 0 });
    expect(result.reached).toEqual({ tier: 1, rank: 2 });
    expect(result.remaining).toBe("0");
    expect(result).not.toHaveProperty("segments");
  });
  it("stops at the configured maximum tier", () => {
    const result = calculateMaxAffordable({ tier: 0, rank: 58 }, 0n, { nepotism: 0, anointment: 0 }, 0);
    expect(result.reached).toEqual({ tier: 0, rank: 58 });
  });
});
