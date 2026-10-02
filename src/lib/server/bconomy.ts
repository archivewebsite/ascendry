import "server-only";
import JSONbigFactory from "json-bigint";
import { itemDataSchema, listingSchema, marketPreviewSchema, priceHistorySchema, transactionSchema, volumeHistorySchema } from "@/lib/server/schemas";

const ENDPOINT = "https://bconomy.net/api/data";
const parser = JSONbigFactory({ storeAsString: true, strict: true });

class RequestQueue {
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(private readonly concurrency: number) {}
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try { return await task(); }
    finally { this.active -= 1; this.waiting.shift()?.(); }
  }
}

const queue = new RequestQueue(4);

export class BconomyApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly retryable: boolean) { super(message); }
}

async function request(apiKey: string, payload: Record<string, unknown>): Promise<unknown> {
  return queue.run(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.text();
        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
          if (!retryable || attempt === 2) throw new BconomyApiError(
            response.status === 401 || response.status === 403 ? "Bconomy rejected the API key." : `Bconomy returned HTTP ${response.status}.`,
            response.status,
            retryable,
          );
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
          continue;
        }
        return parser.parse(body) as unknown;
      } catch (error) {
        lastError = error;
        if (error instanceof BconomyApiError && !error.retryable) throw error;
        if (attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      } finally { clearTimeout(timer); }
    }
    if (lastError instanceof BconomyApiError) throw lastError;
    throw new BconomyApiError("Bconomy could not be reached. The last saved data is still available.", null, true);
  });
}

/**
 * Low-level, server-only access for focused Bconomy routes. The upstream API is
 * intentionally unversioned, so player payloads stay lossless instead of being
 * narrowed to a schema that would silently discard newly added fields.
 */
export async function fetchBconomyData<T = unknown>(apiKey: string, payload: Record<string, unknown>): Promise<T> {
  return request(apiKey, payload) as Promise<T>;
}

export function searchUsers(apiKey: string, query: string) {
  return fetchBconomyData<unknown[]>(apiKey, { type: "search/users", query });
}

export function fetchUserProfile(apiKey: string, bcId: number) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "user/profile", id: bcId });
}

export function fetchUser(apiKey: string, bcId: number) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "user/get", id: bcId });
}

export function fetchUserInventory(apiKey: string, bcId: number) {
  return fetchBconomyData<Record<string, string>>(apiKey, { type: "user/inventory", id: bcId });
}

export function fetchUserPets(apiKey: string, bcId: number) {
  return fetchBconomyData<unknown>(apiKey, { type: "pets/userPetsAndEggs", id: bcId });
}

export function fetchUserStats(apiKey: string, bcId: number) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "stats/user", id: bcId });
}

export function fetchUserTrophies(apiKey: string, bcId: number) {
  return fetchBconomyData<unknown>(apiKey, { type: "stats/trophies", id: bcId });
}

export function fetchFaction(apiKey: string, factionId: number) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "factions/get", id: factionId });
}

export function fetchUserListings(apiKey: string, bcId: number) {
  return fetchBconomyData<unknown[]>(apiKey, { type: "market/userListings", id: bcId });
}

export function fetchUserLogs(apiKey: string, bcId: number, page: number, pageSize: number) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "logs/byBcId", id: bcId, page, pageSize });
}

export function fetchGameState(apiKey: string) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "misc/gameState" });
}

export function fetchGameValues(apiKey: string) {
  return fetchBconomyData<Record<string, unknown>>(apiKey, { type: "misc/gameValues" });
}

export async function fetchSyncData(apiKey: string) {
  const [itemsRaw, previewRaw] = await Promise.all([
    request(apiKey, { type: "misc/itemData" }),
    request(apiKey, { type: "market/preview" }),
  ]);
  return { items: itemDataSchema.parse(itemsRaw), preview: marketPreviewSchema.parse(previewRaw) };
}

export async function fetchListings(apiKey: string, itemId: number) {
  const listings = listingSchema.parse(await request(apiKey, { type: "market/listings", itemId }));
  if (listings.some((listing) => listing.itemId !== itemId)) throw new Error(`Bconomy returned listings for a different item than ${itemId}.`);
  return listings;
}

export async function fetchTransactions(apiKey: string, itemId: number) {
  return transactionSchema.parse(await request(apiKey, { type: "market/recentTransactions", itemId }));
}

export async function fetchPriceHistory(apiKey: string, itemId: number, days = 90) {
  return priceHistorySchema.parse(await request(apiKey, { type: "market/priceHistory", itemId, days }));
}

export async function fetchVolumeHistory(apiKey: string, itemId: number, days = 90) {
  return volumeHistorySchema.parse(await request(apiKey, { type: "market/volumeHistory", itemId, granularity: "day", days }));
}

export async function fetchItemMarket(apiKey: string, itemId: number, days = 90) {
  const [listings, transactions, priceHistory, volumeHistory] = await Promise.all([
    fetchListings(apiKey, itemId),
    fetchTransactions(apiKey, itemId),
    fetchPriceHistory(apiKey, itemId, days),
    fetchVolumeHistory(apiKey, itemId, days),
  ]);
  return { listings, transactions, priceHistory, volumeHistory };
}
