import { NextResponse } from "next/server";
import { fetchUser, fetchUserInventory, fetchUserProfile, fetchUserStats, fetchUserTrophies } from "@/lib/server/bconomy";
import { nonnegativeInteger, restrictedMode, TRACKED_STATS, type TrackerSnapshot } from "@/lib/restricted-tracker";
import { jsonError } from "@/lib/server/http";
import { parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    const apiKey = await requireApiKey();
    const [user, stats, inventory, trophies] = await Promise.all([
      fetchUser(apiKey, bcId),
      fetchUserStats(apiKey, bcId),
      fetchUserInventory(apiKey, bcId),
      fetchUserTrophies(apiKey, bcId),
    ]);
    const userMode = restrictedMode(user.type) ?? restrictedMode(user.profileType);
    const profile = userMode
      ? null
      : await fetchUserProfile(apiKey, bcId);
    const mode = userMode ?? restrictedMode(profile?.type) ?? restrictedMode(profile?.profileType);
    if (!mode) return NextResponse.json({ error: "This BcID is not an Ironman or Hardcore profile." }, { status: 422 });
    const trophyRecord = trophies && typeof trophies === "object" && !Array.isArray(trophies)
      ? (trophies as Record<string, unknown>).trophyRecord
      : null;
    const snapshot: TrackerSnapshot = {
      bcId: String(bcId),
      name: String(user.name ?? `BcID ${bcId}`),
      mode,
      refreshedAt: new Date().toISOString(),
      tier: nonnegativeInteger(user.tier),
      rank: nonnegativeInteger(user.rank),
      questLevel: nonnegativeInteger(user.questLevel),
      bc: nonnegativeInteger(user.bc),
      stats: Object.fromEntries(TRACKED_STATS.map(([key]) => [key, nonnegativeInteger(stats[key])])),
      inventory: Object.fromEntries(Object.entries(inventory).filter(([, amount]) => /^\d+$/.test(String(amount))).map(([key, amount]) => [key, String(amount)])),
      trophies: trophyRecord && typeof trophyRecord === "object" && !Array.isArray(trophyRecord) ? Object.keys(trophyRecord) : [],
    };
    return NextResponse.json(snapshot);
  } catch (error) { return jsonError(error); }
}
