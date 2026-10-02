import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateCraft, calculateCraftFromBudget } from "@/lib/crafting";
import { parseQuantityExpression } from "@/lib/quantity";
import { profileSchema } from "@/lib/plan-schema";
import { InputError } from "@/lib/input";
import { fetchListings } from "@/lib/server/bconomy";
import { reachableCatalogItems } from "@/lib/server/crafting-optimizer";
import { loadApiKey } from "@/lib/server/credential";
import { getCache, getCatalog, putCache } from "@/lib/server/db";
import { jsonError, readJsonRequest } from "@/lib/server/http";
import { calculateOptimizedOrderBookCraft, calculateOptimizedOrderBookCraftFromBudget } from "@/lib/server/optimized-crafting";
import type { CatalogItem, CraftRequest, MarketListing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listingsFor(item: CatalogItem, getApiKey: () => Promise<string | null>, connectionRequired: boolean): Promise<MarketListing[]> {
  const cacheKey = `listings:${item.id}:${item.idName}`;
  const cached = getCache<MarketListing[]>(cacheKey);
  if (cached) return cached;
  const apiKey = await getApiKey();
  if (apiKey) {
    const listings = await fetchListings(apiKey, item.id);
    putCache(cacheKey, listings, 60_000);
    return listings;
  }
  if (!connectionRequired) return [];
  throw new Error(`Connect your Bconomy API key to load listings for ${item.name}.`);
}

const bodySchema = z.object({
  idName: z.string().min(1), targetMode: z.enum(["quantity", "budget"]).default("quantity"), quantity: z.string().optional(), recipeMode: z.enum(["direct", "recursive", "optimized"]), priceMode: z.enum(["lowest", "orderbook"]),
  profile: profileSchema,
  manualPriceOverrides: z.record(z.string(), z.string()).default({}), salePrice: z.string().optional(), budget: z.string().optional(),
}).superRefine((value, context) => {
  if (value.targetMode === "quantity" && !value.quantity?.trim()) context.addIssue({ code: "custom", path: ["quantity"], message: "Enter a quantity." });
  if (value.targetMode === "budget" && !value.budget?.trim()) context.addIssue({ code: "custom", path: ["budget"], message: "Enter a budget." });
});

export async function POST(request: Request) {
  try {
    const raw = bodySchema.parse(await readJsonRequest(request));
    const parseAmount = (value: string, allowZero = false) => {
      try { return parseQuantityExpression(value, { allowZero }).toString(); }
      catch (error) { throw new InputError(error instanceof Error ? error.message : "Invalid amount."); }
    };
    const normalized: CraftRequest = {
      ...raw,
      quantity: raw.targetMode === "quantity" ? parseAmount(raw.quantity!) : "1",
      salePrice: raw.salePrice ? parseAmount(raw.salePrice, true) : undefined,
      budget: raw.targetMode === "budget" ? parseAmount(raw.budget!) : undefined,
      manualPriceOverrides: Object.fromEntries(Object.entries(raw.manualPriceOverrides).map(([key, value]) => [key, parseAmount(value, true)])),
      profile: { ...raw.profile, capturedAt: raw.profile.capturedAt ?? new Date().toISOString() },
    };
    const catalog = getCatalog();
    const seedRequest = { ...normalized, budget: undefined };
    let result = normalized.targetMode === "budget"
      ? calculateCraftFromBudget(normalized, catalog)
      : calculateCraft(normalized, catalog);
    if (normalized.priceMode === "orderbook") {
      let apiKey: Promise<string | null> | undefined;
      const getApiKey = () => apiKey ??= loadApiKey();
      const byName = new Map(catalog.map((item) => [item.idName, item]));
      const seedResult = calculateCraft(seedRequest, catalog);
      const requiredItems = normalized.recipeMode === "optimized"
        ? reachableCatalogItems(normalized.idName, catalog)
        : seedResult.shoppingList.map((line) => byName.get(line.idName)).filter((item): item is CatalogItem => Boolean(item));
      const entries = await Promise.all(requiredItems
        .filter((item) => normalized.manualPriceOverrides[item.idName] === undefined)
        .map(async (item) => [item.idName, await listingsFor(item, getApiKey, normalized.recipeMode === "optimized")] as const));
      normalized.orderBooks = Object.fromEntries(entries);
      result = normalized.targetMode === "budget"
        ? normalized.recipeMode === "optimized"
          ? await calculateOptimizedOrderBookCraftFromBudget(normalized, catalog)
          : calculateCraftFromBudget(normalized, catalog)
        : normalized.recipeMode === "optimized"
          ? await calculateOptimizedOrderBookCraft(normalized, catalog)
          : calculateCraft(normalized, catalog);
    }
    const { orderBooks: _orderBooks, ...publicRequest } = { ...normalized, quantity: result.target.quantity };
    void _orderBooks;
    return NextResponse.json({ request: publicRequest, result });
  } catch (error) { return jsonError(error); }
}
