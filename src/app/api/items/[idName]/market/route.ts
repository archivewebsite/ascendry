import { NextResponse } from "next/server";
import { mergePriceHistory } from "@/lib/history";
import { fetchListings, fetchPriceHistory, fetchTransactions, fetchVolumeHistory } from "@/lib/server/bconomy";
import { loadApiKey } from "@/lib/server/credential";
import { getCache, getItem, localPriceHistory, putCache } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { finiteInteger } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ idName: string }> }) {
  try {
    const { idName } = await context.params;
    const item = getItem(idName);
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
    const days = finiteInteger(new URL(request.url).searchParams.get("days"), 90, 1, 400);
    const listingKey = `listings:${item.id}:${idName}`;
    const transactionKey = `transactions:${item.id}:${idName}`;
    const priceKey = `price-history:${item.id}:${idName}:${days}`;
    const volumeKey = `volume-history:${item.id}:${idName}:${days}`;
    const cachedListings = getCache<Awaited<ReturnType<typeof fetchListings>>>(listingKey);
    const cachedTransactions = getCache<Awaited<ReturnType<typeof fetchTransactions>>>(transactionKey);
    const cachedPrices = getCache<Awaited<ReturnType<typeof fetchPriceHistory>>>(priceKey);
    const cachedVolumes = getCache<Awaited<ReturnType<typeof fetchVolumeHistory>>>(volumeKey);
    const cached = Boolean(cachedListings && cachedTransactions && cachedPrices && cachedVolumes);
    const apiKey = cached ? null : await loadApiKey();
    if (!cached && !apiKey) return NextResponse.json({ error: "Connect a Bconomy API key to load live item details.", localHistory: localPriceHistory(idName) }, { status: 401 });
    const [listings, transactions, priceHistory, volumeHistory] = await Promise.all([
      cachedListings ?? fetchListings(apiKey!, item.id).then((value) => { putCache(listingKey, value, 60_000); return value; }),
      cachedTransactions ?? fetchTransactions(apiKey!, item.id).then((value) => { putCache(transactionKey, value, 5 * 60_000); return value; }),
      cachedPrices ?? fetchPriceHistory(apiKey!, item.id, days).then((value) => { putCache(priceKey, value, 6 * 60 * 60_000); return value; }),
      cachedVolumes ?? fetchVolumeHistory(apiKey!, item.id, days).then((value) => { putCache(volumeKey, value, 6 * 60 * 60_000); return value; }),
    ]);
    const merged = mergePriceHistory(priceHistory, localPriceHistory(idName));
    return NextResponse.json({ listings, transactions, priceHistory: merged, volumeHistory, cached });
  } catch (error) { return jsonError(error); }
}
