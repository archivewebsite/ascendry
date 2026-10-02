import { NextResponse } from "next/server";
import { fetchUserInventory } from "@/lib/server/bconomy";
import { getCatalog } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    const inventory = await fetchUserInventory(await requireApiKey(), bcId);
    const items = getCatalog().map((item) => ({ ...item, amount: inventory[item.idName] ?? "0" })).filter((item) => BigInt(item.amount) > 0n);
    return NextResponse.json({ bcId: String(bcId), inventory, items, refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
