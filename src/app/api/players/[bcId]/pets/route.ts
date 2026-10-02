import { NextResponse } from "next/server";
import { fetchUserPets } from "@/lib/server/bconomy";
import { jsonError } from "@/lib/server/http";
import { parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    return NextResponse.json({ bcId: String(bcId), data: await fetchUserPets(await requireApiKey(), bcId), refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
