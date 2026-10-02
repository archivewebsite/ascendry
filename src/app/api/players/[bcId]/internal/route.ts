import { NextResponse } from "next/server";
import { fetchUser, fetchUserProfile, fetchUserStats, fetchUserTrophies } from "@/lib/server/bconomy";
import { jsonError } from "@/lib/server/http";
import { parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    const apiKey = await requireApiKey();
    const [user, profile, stats, trophies] = await Promise.all([
      fetchUser(apiKey, bcId), fetchUserProfile(apiKey, bcId), fetchUserStats(apiKey, bcId), fetchUserTrophies(apiKey, bcId),
    ]);
    return NextResponse.json({ bcId: String(bcId), data: { user, profile, stats, trophies }, refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
