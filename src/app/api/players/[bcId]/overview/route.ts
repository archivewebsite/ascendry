import { NextResponse } from "next/server";
import { fetchFaction, fetchGameState, fetchUser, fetchUserProfile, fetchUserStats, fetchUserTrophies } from "@/lib/server/bconomy";
import { jsonError } from "@/lib/server/http";
import { parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    const apiKey = await requireApiKey();
    const user = await fetchUser(apiKey, bcId);
    const factionId = typeof user.factionId === "string" || typeof user.factionId === "number" ? Number(user.factionId) : null;
    const [profile, stats, trophies, gameState, faction] = await Promise.all([
      fetchUserProfile(apiKey, bcId),
      fetchUserStats(apiKey, bcId),
      fetchUserTrophies(apiKey, bcId),
      fetchGameState(apiKey),
      factionId && Number.isSafeInteger(factionId) ? fetchFaction(apiKey, factionId) : Promise.resolve(null),
    ]);
    return NextResponse.json({ bcId: String(bcId), profile, user, stats, trophies, faction, gameState, refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
