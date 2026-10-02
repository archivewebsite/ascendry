import { describe, expect, it } from "vitest";
import { mergePriceHistory } from "@/lib/history";

describe("price history merging", () => {
  it("sorts timestamps and prefers official data for duplicate instants", () => {
    const merged = mergePriceHistory(
      [{ snapshotTime: "2026-01-02T00:00:00.000Z", lowestPrice: "20" }],
      [
        { snapshotTime: "2026-01-01T00:00:00.000Z", lowestPrice: "10" },
        { snapshotTime: "2026-01-02T00:00:00Z", lowestPrice: "19" },
      ],
    );
    expect(merged).toEqual([
      { snapshotTime: "2026-01-01T00:00:00.000Z", lowestPrice: "10", source: "local" },
      { snapshotTime: "2026-01-02T00:00:00.000Z", lowestPrice: "20", source: "official" },
    ]);
  });
});
