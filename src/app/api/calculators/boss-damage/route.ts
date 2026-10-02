import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateCraft } from "@/lib/crafting";
import { calculateWeaponQuantity, DEFAULT_BOUNTY_DAMAGE_FRACTION_BPS, DEFAULT_MAX_BOUNTIES, weaponsFromCatalog } from "@/lib/boss-damage";
import { fillOrderBook } from "@/lib/market-math";
import { fetchGameState, fetchGameValues, fetchListings, fetchUserInventory } from "@/lib/server/bconomy";
import { loadApiKey } from "@/lib/server/credential";
import { getCatalog } from "@/lib/server/db";
import { jsonError, readJsonRequest } from "@/lib/server/http";
import { parseBcId } from "@/lib/input";
import type { CatalogItem, CraftRequest, MarketListing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["max-bounties", "target-bounties", "kill-boss"]),
  weapon: z.string().min(1),
  pricingMode: z.enum(["market", "direct", "recursive", "base"]),
  bossHp: z.string().regex(/^\d+$/),
  targetBounties: z.string().regex(/^\d+$/),
  multiplierBps: z.string().regex(/^\d+$/),
  weakpoint: z.boolean(),
  buddyLevel: z.number().int().min(0).max(1_000),
  bcId: z.string().regex(/^\d+$/).optional(),
});

function numeric(record: Record<string, unknown>, key: string, fallback: bigint) {
  try { return record[key] === undefined ? fallback : BigInt(String(record[key])); } catch { return fallback; }
}

function profile() { return { name: "Boss calculator", levels: {} }; }

async function craftingCost(item: CatalogItem, quantity: bigint, mode: "direct" | "recursive", apiKey: string, listingFor: (item: CatalogItem) => Promise<MarketListing[]>) {
  const catalog = getCatalog();
  const seed: CraftRequest = { idName: item.idName, quantity: quantity.toString(), recipeMode: mode, priceMode: "lowest", profile: profile(), manualPriceOverrides: {} };
  const initial = calculateCraft(seed, catalog);
  const byId = new Map(catalog.map((entry) => [entry.idName, entry]));
  const entries = await Promise.all(initial.shoppingList.map(async (line) => {
    const ingredient = byId.get(line.idName);
    return [line.idName, ingredient ? await listingFor(ingredient) : []] as const;
  }));
  const request: CraftRequest = { ...seed, priceMode: "orderbook", orderBooks: Object.fromEntries(entries) };
  const result = calculateCraft(request, catalog);
  return { cost: BigInt(result.selectedKnownTotal), complete: result.complete, shoppingList: result.shoppingList, missingPrices: result.missingPrices, unfilled: result.orderBookUnfilled };
}

export async function GET() {
  try {
    const weapons = weaponsFromCatalog(getCatalog()).map((weapon) => ({ ...weapon, damage: weapon.damage.toString() }));
    let apiKey: string | null = null;
    try { apiKey = await loadApiKey(); } catch { /* Static weapon reference remains available. */ }
    if (!apiKey) return NextResponse.json({ weapons, activeBoss: null, gameValues: null });
    const [state, values] = await Promise.allSettled([fetchGameState(apiKey), fetchGameValues(apiKey)]);
    const gameState = state.status === "fulfilled" ? state.value : {};
    const gameValues = values.status === "fulfilled" ? values.value : null;
    const warning = state.status === "rejected" || values.status === "rejected" ? "Live boss reference could not be fully loaded. Local weapons and default constants remain available." : undefined;
    return NextResponse.json({ weapons, activeBoss: gameState.activeBossStatus ?? null, gameValues, warning, refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJsonRequest(request));
    const bcId = body.bcId === undefined ? undefined : parseBcId(body.bcId);
    let apiKey: string | null = null;
    try { apiKey = await loadApiKey(); }
    catch (error) { if (body.pricingMode !== "base" || body.bcId) throw error; }
    if (!apiKey && (body.pricingMode !== "base" || body.bcId)) throw new Error("Connect a Bconomy API key to use live market, inventory, and crafting prices.");
    let gameValues: Record<string, unknown> = {};
    let constantsSource = "defaults";
    if (apiKey) {
      try { gameValues = await fetchGameValues(apiKey); constantsSource = "live"; }
      catch (error) { if (body.pricingMode !== "base") throw error; }
    }
    const maxBounties = numeric(gameValues, "maxStandardLootItemPerAttacker", DEFAULT_MAX_BOUNTIES);
    const fractionRaw = gameValues.standardLootBaseDamageFraction;
    const fractionBps = fractionRaw === undefined ? DEFAULT_BOUNTY_DAMAGE_FRACTION_BPS : BigInt(Math.round(Number(fractionRaw) * 10_000));
    const buddyIncrease = Number(gameValues.buddyAttackMultiplierIncreasePerLevel ?? .05);
    const combinedMultiplierBps = BigInt(body.multiplierBps) + BigInt(Math.round(buddyIncrease * 10_000 * body.buddyLevel));
    const inventory = bcId !== undefined && apiKey ? await fetchUserInventory(apiKey, bcId) : {};
    const catalog = getCatalog();
    const weapons = weaponsFromCatalog(catalog);
    const byIdName = new Map(catalog.map((item) => [item.idName, item]));
    const candidates = body.weapon === "any" ? weapons : weapons.filter((weapon) => weapon.idName === body.weapon);
    if (!candidates.length) throw new Error("Unknown weapon.");
    const listingPromises = new Map<number, Promise<MarketListing[]>>();
    const listingFor = (item: CatalogItem) => {
      let pending = listingPromises.get(item.id);
      if (!pending) { pending = fetchListings(apiKey!, item.id); listingPromises.set(item.id, pending); }
      return pending;
    };

    const results = await Promise.all(candidates.map(async (weapon) => {
      const item = byIdName.get(weapon.idName);
      if (!item) throw new Error(`${weapon.name} is missing from the catalog.`);
      const damage = calculateWeaponQuantity({ mode: body.mode, weaponDamage: weapon.damage, bossHp: BigInt(body.bossHp), targetBounties: BigInt(body.targetBounties), maxBounties, bountyFractionBps: fractionBps, multiplierBps: combinedMultiplierBps, weakpoint: body.weakpoint });
      const owned = BigInt(inventory[weapon.idName] ?? "0");
      const acquire = damage.quantity > owned ? damage.quantity - owned : 0n;
      let knownCost = 0n; let complete = true; let details: unknown = null;
      let pricedQuantity: bigint | null = null;
      let unpricedQuantity: bigint | null = null;
      if (body.pricingMode === "base") knownCost = BigInt(item.baseValue) * acquire;
      else if (acquire > 0n && body.pricingMode === "market") {
        const fill = fillOrderBook(acquire, await listingFor(item));
        knownCost = fill.knownCost;
        complete = fill.unfilled === 0n;
        pricedQuantity = fill.filled;
        unpricedQuantity = fill.unfilled;
        details = { ...fill, knownCost: fill.knownCost.toString(), filled: fill.filled.toString(), unfilled: fill.unfilled.toString() };
      } else if (acquire > 0n) {
        const crafted = await craftingCost(item, acquire, body.pricingMode as "direct" | "recursive", apiKey!, listingFor);
        knownCost = crafted.cost;
        complete = crafted.complete;
        details = { ...crafted, cost: crafted.cost.toString() };
      }
      return { idName: weapon.idName, name: weapon.name, baseDamagePerWeapon: weapon.damage.toString(), effectiveDamagePerWeapon: damage.perWeaponEffective.toString(), quantity: damage.quantity.toString(), owned: owned.toString(), acquire: acquire.toString(), baseDamage: damage.baseDamage.toString(), effectiveDamage: damage.effectiveDamage.toString(), overkill: damage.overkill.toString(), bounties: damage.bounties.toString(), cost: complete ? knownCost.toString() : null, knownCost: knownCost.toString(), pricedQuantity: pricedQuantity?.toString() ?? null, unpricedQuantity: unpricedQuantity?.toString() ?? null, complete, details };
    }));
    results.sort((left, right) => {
      if (left.complete !== right.complete) return left.complete ? -1 : 1;
      if (left.complete) { const cost = BigInt(left.knownCost) - BigInt(right.knownCost); if (cost !== 0n) return cost < 0n ? -1 : 1; }
      const overkill = BigInt(left.overkill) - BigInt(right.overkill); if (overkill !== 0n) return overkill < 0n ? -1 : 1;
      const quantity = BigInt(left.quantity) - BigInt(right.quantity); if (quantity !== 0n) return quantity < 0n ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
    return NextResponse.json({ results, best: results[0], constantsSource, constants: { maxBounties: maxBounties.toString(), bountyFractionBps: fractionBps.toString(), weakpointMultiplier: "2", buddyIncreasePerLevel: String(buddyIncrease) }, calculatedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
