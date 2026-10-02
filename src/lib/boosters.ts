import { calculateCraft } from "@/lib/crafting";
import { fillOrderBook } from "@/lib/market-math";
import type { CatalogItem, CraftRequest, MarketListing } from "@/lib/types";

export const BOOSTER_TIERS = [
  { tier: "T1", minutes: 15 },
  { tier: "T2", minutes: 30 },
  { tier: "T3", minutes: 60 },
  { tier: "T4", minutes: 120 },
  { tier: "T5", minutes: 240 },
  { tier: "T6", minutes: 480 },
] as const;

export const BOOSTER_ACTIONS = ["explore", "fish", "hunt", "mine"] as const;
export type BoosterAction = typeof BOOSTER_ACTIONS[number];

// One action boost item for each tier, in T1–T6 order.
export const BOOSTER_ITEMS = {
  explore: [
    { idName: "paintedtotem", name: "Painted Totem" },
    { idName: "downyparka", name: "Downy Parka" },
    { idName: "survivalkit", name: "Survival Kit" },
    { idName: "cursedcharm", name: "Cursed Charm" },
    { idName: "seraphicclasp", name: "Seraphic Clasp" },
    { idName: "daoicseal", name: "Daoic Seal" },
  ],
  fish: [
    { idName: "nauticalcompass", name: "Nautical Compass" },
    { idName: "fishfinder", name: "Fish Finder" },
    { idName: "scoutsubmarine", name: "Scout Submarine" },
    { idName: "massivedriftnet", name: "Massive Driftnet" },
    { idName: "magicconch", name: "Magic Conch" },
    { idName: "atlanticobol", name: "Atlantic Obol" },
  ],
  hunt: [
    { idName: "ornatenecklace", name: "Ornate Necklace" },
    { idName: "sharktoothnecklace", name: "Sharktooth Necklace" },
    { idName: "knifeturret", name: "Knife Turret" },
    { idName: "mutagenicsludge", name: "Mutagenic Sludge" },
    { idName: "untamedspirit", name: "Untamed Spirit" },
    { idName: "huntersblind", name: "Hunter's Blind" },
  ],
  mine: [
    { idName: "ancientfossil", name: "Ancient Fossil" },
    { idName: "dowsingrod", name: "Dowsing Rod" },
    { idName: "mechacanary", name: "Mecha Canary" },
    { idName: "orbitalmininglaser", name: "Orbital Mining Laser" },
    { idName: "condemnedskull", name: "Condemned Skull" },
    { idName: "subterrancrest", name: "Subterran Crest" },
  ],
} as const;

export const TIME_UNITS = [
  { label: "Years", seconds: 365n * 24n * 60n * 60n },
  { label: "Months", seconds: 30n * 24n * 60n * 60n },
  { label: "Days", seconds: 24n * 60n * 60n },
  { label: "Hours", seconds: 60n * 60n },
  { label: "Minutes", seconds: 60n },
  { label: "Seconds", seconds: 1n },
] as const;

export function parseWholeNumber(input: string): bigint | null {
  const trimmed = input.trim();
  if (!trimmed) return 0n;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(trimmed)) return null;
  return BigInt(trimmed.replaceAll(",", ""));
}

export function durationForItems(count: bigint, minutes: number): bigint {
  return count * BigInt(minutes) * 60n;
}

export function itemsForDuration(seconds: bigint, minutes: number): bigint {
  const itemSeconds = BigInt(minutes) * 60n;
  return (seconds + itemSeconds - 1n) / itemSeconds;
}

export function quoteBoosterCost(item: CatalogItem, quantity: bigint, catalog: CatalogItem[], orderBooks: Record<string, MarketListing[]>) {
  const method = item.craftable && item.recipe.length > 0 ? "Craft" : "Buy";
  if (quantity === 0n) return { method, cost: 0n, estimate: 0n, knownCost: 0n, unfilled: [], lines: [] };
  const request: CraftRequest = {
    idName: item.idName, quantity: quantity.toString(), recipeMode: "direct", priceMode: "orderbook",
    profile: { name: "Booster calculator", levels: {} }, manualPriceOverrides: {}, orderBooks,
  };
  const result = calculateCraft(request, catalog);
  const lines = result.shoppingList.map((line) => ({ idName: line.idName, name: line.name, quantity: BigInt(line.quantity) }));
  return { method, ...quoteMarketDemand(lines, orderBooks), lines };
}

export function quoteBoosterBasket(quotes: Array<ReturnType<typeof quoteBoosterCost>>, orderBooks: Record<string, MarketListing[]>) {
  const merged = new Map<string, { idName: string; name: string; quantity: bigint }>();
  for (const quote of quotes) for (const line of quote.lines) {
    const current = merged.get(line.idName);
    merged.set(line.idName, { ...line, quantity: line.quantity + (current?.quantity ?? 0n) });
  }
  return quoteMarketDemand([...merged.values()], orderBooks);
}

function quoteMarketDemand(lines: Array<{ idName: string; name: string; quantity: bigint }>, orderBooks: Record<string, MarketListing[]>) {
  let knownCost = 0n;
  let estimate: bigint | null = 0n;
  const unfilled: Array<{ name: string; quantity: bigint }> = [];
  for (const line of lines) {
    const listings = orderBooks[line.idName] ?? [];
    const fill = fillOrderBook(line.quantity, listings);
    knownCost += fill.knownCost;
    if (fill.unfilled > 0n) unfilled.push({ name: line.name, quantity: fill.unfilled });
    if (listings.length === 0) estimate = null;
    else if (estimate !== null) {
      const lowest = listings.reduce((best, listing) => {
        const price = BigInt(listing.price);
        return price < best ? price : best;
      }, BigInt(listings[0]!.price));
      estimate += lowest * line.quantity;
    }
  }
  return { cost: unfilled.length === 0 ? knownCost : null, estimate, knownCost, unfilled };
}

export function formatDuration(seconds: bigint): string {
  let remaining = seconds;
  return TIME_UNITS.map(({ label, seconds: unitSeconds }) => {
    const amount = remaining / unitSeconds;
    remaining %= unitSeconds;
    return `${amount.toLocaleString("en-US")} ${amount === 1n ? label.slice(0, -1).toLowerCase() : label.toLowerCase()}`;
  }).join(" · ");
}
