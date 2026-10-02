import { describe, expect, it } from "vitest";
import { calculateProfitability, fillOrderBook, marketFeeBps, maxQuantityWithinBudget } from "@/lib/market-math";

describe("market arithmetic", () => {
  it("fills cheapest listings first and reports exact shortfall", () => {
    const result = fillOrderBook(10n, [
      { id: "2", bcId: "1", itemId: 1, price: "7", amount: "3" },
      { id: "1", bcId: "1", itemId: 1, price: "5", amount: "4" },
    ]);
    expect(result.knownCost).toBe(41n); expect(result.filled).toBe(7n); expect(result.unfilled).toBe(3n);
  });
  it("rejects invalid or duplicated listing supply", () => {
    const make = (id: string, price: string, amount: string) => ({ id, bcId: "1", itemId: 1, price, amount });
    expect(() => fillOrderBook(2n, [make("bad", "5", "-1")])).toThrow(/invalid/i);
    expect(() => fillOrderBook(2n, [make("bad", "-5", "1")])).toThrow(/invalid/i);
    expect(() => fillOrderBook(2n, [make("same", "5", "1"), make("same", "5", "1")])).toThrow(/duplicate/i);
  });
  it("applies Insider endpoints", () => { expect(marketFeeBps(0)).toBe(2500); expect(marketFeeBps(45)).toBe(250); });
  it("floors fee and rounds break-even upward", () => {
    const result = calculateProfitability({ quantity: 3n, saleUnitPrice: 101n, materialCost: 200n, insiderLevel: 0, mercantilistLevel: 2, requiredMercantilistLevel: 3 });
    expect(result.fee).toBe("76"); expect(result.net).toBe("227"); expect(result.profit).toBe("27"); expect(result.breakEvenListingPrice).toBe("89"); expect(result.hypothetical).toBe(true);
  });
  it("finds budget capacity monotonically", () => expect(maxQuantityWithinBudget(100n, (quantity) => quantity * 7n)).toBe(14n));
});
