import type { CatalogItem } from "@/lib/types";
import { z } from "zod";
import { parseBcId } from "@/lib/input";
import { nonnegativeString, timestampSchema } from "@/lib/plan-schema";

export type RestrictedMode = "ironman" | "hardcore";

export const TRACKED_STATS = [
  ["itemsCrafted", "Items crafted"],
  ["rareItemsFound", "Rare finds"],
  ["bossDamage", "Boss damage"],
  ["questsCompleted", "Quests completed"],
  ["museumCollectiblesFound", "Museum finds"],
] as const;

export interface TrackerSnapshot {
  bcId: string;
  name: string;
  mode: RestrictedMode;
  refreshedAt: string;
  tier: string;
  rank: string;
  questLevel: string;
  bc: string;
  stats: Record<string, string>;
  inventory: Record<string, string>;
  trophies: string[];
}

export interface DepotQuote { price: string; stock: string }

export interface MonitoredProfile {
  bcId: string;
  latest: TrackerSnapshot;
  previous: TrackerSnapshot | null;
  goal: { idName: string; quantity: string } | null;
  depotQuotes: Record<string, DepotQuote>;
}

export function restrictedMode(value: unknown): RestrictedMode | null {
  const mode = String(value ?? "").trim().toLowerCase();
  if (mode === "ironman") return "ironman";
  if (mode === "hardcore") return "hardcore";
  return null;
}

export function nonnegativeInteger(value: unknown): string {
  const text = String(value ?? "0");
  return /^\d+$/.test(text) ? text : "0";
}

export function progressDelta(current: string, previous?: string): string | null {
  if (previous === undefined) return null;
  return (BigInt(current) - BigInt(previous)).toString();
}

export function normalizeMonitoredProfiles(value: unknown): MonitoredProfile[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const profiles: MonitoredProfile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Partial<MonitoredProfile>;
    let bcId: string;
    try { bcId = String(parseBcId(String(candidate.bcId))); } catch { continue; }
    if (seen.has(bcId)) continue;
    const latest = trackerSnapshotSchema.safeParse(candidate.latest);
    if (!latest.success || latest.data.bcId !== bcId) continue;
    const previous = trackerSnapshotSchema.safeParse(candidate.previous);
    const depotQuotes: Record<string, DepotQuote> = {};
    for (const [id, value] of Object.entries(candidate.depotQuotes && typeof candidate.depotQuotes === "object" ? candidate.depotQuotes : {})) {
      const quote = depotQuoteSchema.safeParse(value);
      if (quote.success) depotQuotes[id] = quote.data;
    }
    seen.add(bcId);
    profiles.push({
      bcId,
      latest: latest.data,
      previous: previous.success && previous.data.bcId === bcId ? previous.data : null,
      goal: candidate.goal?.idName && typeof candidate.goal.idName === "string" && typeof candidate.goal.quantity === "string" && /^\d+$/.test(candidate.goal.quantity) && BigInt(candidate.goal.quantity) > 0n ? candidate.goal : null,
      depotQuotes,
    });
    if (profiles.length === 2) break;
  }
  return profiles;
}

const trackerSnapshotSchema = z.object({
  bcId: z.string().transform((value, context) => {
    try { return String(parseBcId(value)); } catch { context.addIssue({ code: "custom", message: "Invalid BcID." }); return z.NEVER; }
  }),
  name: z.string().default("Unknown profile"), mode: z.enum(["ironman", "hardcore"]), refreshedAt: timestampSchema,
  tier: nonnegativeString.default("0"), rank: nonnegativeString.default("0"), questLevel: nonnegativeString.default("0"), bc: nonnegativeString.default("0"),
  stats: z.record(z.string(), nonnegativeString), inventory: z.record(z.string(), nonnegativeString), trophies: z.array(z.string()),
});
const depotQuoteSchema = z.object({ price: z.string().regex(/^\d*$/), stock: z.string().regex(/^\d*$/) });

export interface RestrictedCraftPlan {
  targetNeeded: string;
  ownedUsed: Array<{ idName: string; name: string; quantity: string }>;
  craftSteps: Array<{ idName: string; name: string; quantity: string }>;
  deficits: Array<{ idName: string; name: string; quantity: string; lootSources: string[] }>;
}

export function planRestrictedCraft(
  targetIdName: string,
  quantity: string,
  catalog: CatalogItem[],
  inventory: Record<string, string>,
): RestrictedCraftPlan {
  const requested = BigInt(quantity);
  if (requested <= 0n) throw new Error("Goal quantity must be greater than zero.");
  const byId = new Map(catalog.map((item) => [item.idName, item]));
  if (!byId.has(targetIdName)) throw new Error("The selected item is not in the catalog.");
  const available = new Map(Object.entries(inventory).map(([id, amount]) => [id, BigInt(nonnegativeInteger(amount))]));
  const used = new Map<string, bigint>();
  const craft = new Map<string, bigint>();
  const missing = new Map<string, bigint>();

  function allocate(idName: string, needed: bigint, ancestors: Set<string>) {
    const item = byId.get(idName);
    if (!item) throw new Error(`Recipe references an unknown item: ${idName}.`);
    if (ancestors.has(idName)) throw new Error(`Crafting cycle detected at ${item.name}.`);
    const owned = available.get(idName) ?? 0n;
    const taken = owned < needed ? owned : needed;
    if (taken > 0n) {
      available.set(idName, owned - taken);
      used.set(idName, (used.get(idName) ?? 0n) + taken);
    }
    const remaining = needed - taken;
    if (remaining === 0n) return;
    if (!item.craftable || item.recipe.length === 0) {
      missing.set(idName, (missing.get(idName) ?? 0n) + remaining);
      return;
    }
    craft.set(idName, (craft.get(idName) ?? 0n) + remaining);
    const next = new Set(ancestors).add(idName);
    for (const ingredient of item.recipe) allocate(ingredient.ingredientIdName, remaining * BigInt(ingredient.amount), next);
  }

  allocate(targetIdName, requested, new Set());
  const ordered = new Map<string, bigint>();
  function order(idName: string) {
    if (ordered.has(idName) || !craft.has(idName)) return;
    for (const ingredient of byId.get(idName)!.recipe) order(ingredient.ingredientIdName);
    ordered.set(idName, craft.get(idName)!);
  }
  for (const idName of craft.keys()) order(idName);
  const rows = (values: Map<string, bigint>) => [...values].map(([idName, amount]) => ({
    idName,
    name: byId.get(idName)!.name,
    quantity: amount.toString(),
  }));
  return {
    targetNeeded: requested.toString(),
    ownedUsed: rows(used),
    craftSteps: rows(ordered),
    deficits: rows(missing).map((row) => ({ ...row, lootSources: byId.get(row.idName)!.lootSources })),
  };
}

export function estimateDepot(plan: RestrictedCraftPlan, quotes: Record<string, DepotQuote>) {
  let knownCost = 0n;
  let covered = 0n;
  let outstanding = 0n;
  for (const deficit of plan.deficits) {
    const needed = BigInt(deficit.quantity);
    const quote = quotes[deficit.idName];
    if (!quote || !/^\d+$/.test(quote.price) || !/^\d+$/.test(quote.stock)) {
      outstanding += needed;
      continue;
    }
    const stock = BigInt(quote.stock);
    const bought = stock < needed ? stock : needed;
    covered += bought;
    outstanding += needed - bought;
    knownCost += bought * BigInt(quote.price);
  }
  return { knownCost: knownCost.toString(), covered: covered.toString(), outstanding: outstanding.toString() };
}
