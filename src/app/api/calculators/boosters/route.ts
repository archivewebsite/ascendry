import { NextResponse } from "next/server";
import { z } from "zod";
import { BOOSTER_ACTIONS, BOOSTER_ITEMS, BOOSTER_TIERS } from "@/lib/boosters";
import { fetchListings } from "@/lib/server/bconomy";
import { loadApiKey } from "@/lib/server/credential";
import { getCache, getCatalog, putCache } from "@/lib/server/db";
import { jsonError, readJsonRequest } from "@/lib/server/http";
import type { CatalogItem, MarketListing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ itemIds: z.array(z.string()).length(BOOSTER_TIERS.length), force: z.boolean().default(false) });

export async function POST(request: Request) {
  try {
    const { itemIds, force } = requestSchema.parse(await readJsonRequest(request));
    const allowed = itemIds.every((idName, index) => BOOSTER_ACTIONS.some((action) => BOOSTER_ITEMS[action][index]?.idName === idName));
    if (!allowed) return NextResponse.json({ error: "Select a valid booster item for each tier." }, { status: 400 });

    const catalog = new Map(getCatalog().map((item) => [item.idName, item]));
    const items = itemIds.map((idName) => catalog.get(idName));
    if (items.some((item) => !item)) return NextResponse.json({ error: "A selected booster is missing from the catalog." }, { status: 404 });

    const selected = items.filter((item): item is CatalogItem => item !== undefined);
    const relevant = new Map(selected.map((item) => [item.idName, item]));
    const marketItems = new Map<string, CatalogItem>();
    for (const item of selected) {
      if (!item.craftable || item.recipe.length === 0) marketItems.set(item.idName, item);
      else for (const ingredient of item.recipe) {
        const child = catalog.get(ingredient.ingredientIdName);
        if (!child) throw new Error(`Recipe for ${item.name} references an unknown item.`);
        relevant.set(child.idName, child);
        marketItems.set(child.idName, child);
      }
    }
    const needed = [...marketItems.values()];
    const keys = needed.map((item) => `listings:${item.id}:${item.idName}`);
    const cached = keys.map((key) => force ? null : getCache<MarketListing[]>(key));
    const allCached = cached.every((listings) => listings !== null);
    const apiKey = allCached ? null : await loadApiKey();
    if (!allCached && !apiKey) return NextResponse.json({ error: "Connect a Bconomy API key in Settings to load live booster prices." }, { status: 401 });

    const books = await Promise.all(needed.map(async (item, index) => {
      let listings = cached[index];
      if (listings === null || listings === undefined) {
        listings = await fetchListings(apiKey!, item.id);
        putCache(keys[index]!, listings, 60_000);
      }
      return [item.idName, listings] as const;
    }));
    return NextResponse.json({ items: selected.map((item) => ({ idName: item.idName, name: item.name, craftable: item.craftable })), catalog: [...relevant.values()], orderBooks: Object.fromEntries(books), checkedAt: new Date().toISOString(), cached: allCached });
  } catch (error) { return jsonError(error); }
}
