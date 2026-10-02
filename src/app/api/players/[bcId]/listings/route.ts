import { NextResponse } from "next/server";
import { fetchUserListings } from "@/lib/server/bconomy";
import { getCatalog } from "@/lib/server/db";
import { jsonError } from "@/lib/server/http";
import { parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    const data = await fetchUserListings(await requireApiKey(), bcId);
    const catalog = Object.fromEntries(getCatalog().map((item) => [item.id, { idName: item.idName, name: item.name, emoji: item.emoji }]));
    return NextResponse.json({ bcId: String(bcId), data, catalog, refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
