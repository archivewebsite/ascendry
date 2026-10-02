import type { MarketListing, ProfitabilityResult } from "@/lib/types";

export function fillOrderBook(quantity: bigint, listings: MarketListing[]) {
  if (quantity < 0n) throw new Error("Order quantity cannot be negative.");
  let remaining = quantity;
  let cost = 0n;
  const fills: Array<{ listingId: string; quantity: string; unitPrice: string; subtotal: string }> = [];
  const seen = new Set<string>();
  for (const listing of listings) {
    if (seen.has(listing.id)) throw new Error(`Duplicate market listing ${listing.id}.`);
    seen.add(listing.id);
    if (BigInt(listing.amount) <= 0n || BigInt(listing.price) < 0n) throw new Error(`Invalid market listing ${listing.id}.`);
  }
  const sorted = [...listings].sort((a, b) => {
    const delta = BigInt(a.price) - BigInt(b.price);
    return delta < 0n ? -1 : delta > 0n ? 1 : 0;
  });
  for (const listing of sorted) {
    if (remaining === 0n) break;
    const available = BigInt(listing.amount);
    const used = available < remaining ? available : remaining;
    const subtotal = used * BigInt(listing.price);
    fills.push({ listingId: listing.id, quantity: used.toString(), unitPrice: listing.price, subtotal: subtotal.toString() });
    remaining -= used;
    cost += subtotal;
  }
  return { knownCost: cost, filled: quantity - remaining, unfilled: remaining, fills };
}

export function marketFeeBps(insiderLevel: number): number {
  if (!Number.isInteger(insiderLevel) || insiderLevel < 0 || insiderLevel > 45) throw new Error("Insider level must be from 0 to 45.");
  return Math.max(250, 2500 - 50 * insiderLevel);
}

export function calculateProfitability(input: {
  quantity: bigint;
  saleUnitPrice: bigint | null;
  materialCost: bigint | null;
  insiderLevel: number;
  mercantilistLevel: number;
  requiredMercantilistLevel: number | null;
}): ProfitabilityResult {
  if (!Number.isInteger(input.mercantilistLevel) || input.mercantilistLevel < 0 || input.mercantilistLevel > 61) {
    throw new Error("Mercantilist level must be from 0 to 61.");
  }
  const feeBps = marketFeeBps(input.insiderLevel);
  const gross = input.saleUnitPrice === null ? null : input.saleUnitPrice * input.quantity;
  const denominator = 10_000n - BigInt(feeBps);
  const net = gross === null ? null : (gross * denominator) / 10_000n;
  const fee = gross === null || net === null ? null : gross - net;
  const profit = net === null || input.materialCost === null ? null : net - input.materialCost;
  const marginPercent = profit === null || gross === null || gross === 0n ? null : Number((profit * 10_000n) / gross) / 100;
  const roiPercent = profit === null || input.materialCost === null || input.materialCost === 0n ? null : Number((profit * 10_000n) / input.materialCost) / 100;
  const breakEvenListingPrice = input.materialCost === null || input.quantity === 0n
    ? null
    : ((input.materialCost * 10_000n + input.quantity * denominator - 1n) / (input.quantity * denominator));
  const eligible = input.requiredMercantilistLevel === null ? null : input.mercantilistLevel >= input.requiredMercantilistLevel;
  return {
    feeBps,
    gross: gross?.toString() ?? null,
    fee: fee?.toString() ?? null,
    net: net?.toString() ?? null,
    materialCost: input.materialCost?.toString() ?? null,
    profit: profit?.toString() ?? null,
    marginPercent,
    roiPercent,
    breakEvenListingPrice: breakEvenListingPrice?.toString() ?? null,
    requiredMercantilistLevel: input.requiredMercantilistLevel,
    eligibleToSell: eligible,
    hypothetical: eligible === false,
  };
}

export function maxQuantityWithinBudget(budget: bigint, costFor: (quantity: bigint) => bigint | null): bigint {
  if (budget < 0n) throw new Error("Budget cannot be negative.");
  let low = 0n;
  let high = 1n;
  while (true) {
    const cost = costFor(high);
    if (cost === null || cost > budget) break;
    low = high;
    high *= 2n;
    if (high > 10n ** 60n) break;
  }
  while (low + 1n < high) {
    const mid = (low + high) / 2n;
    const cost = costFor(mid);
    if (cost !== null && cost <= budget) low = mid;
    else high = mid;
  }
  return low;
}
