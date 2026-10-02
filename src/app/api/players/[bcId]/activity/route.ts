import { NextResponse } from "next/server";
import { fetchUserLogs } from "@/lib/server/bconomy";
import { jsonError } from "@/lib/server/http";
import { finiteInteger, parseBcId, requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ bcId: string }> }) {
  try {
    const bcId = parseBcId((await context.params).bcId);
    const url = new URL(request.url);
    const page = finiteInteger(url.searchParams.get("page"), 1, 1, 10_000);
    const pageSize = finiteInteger(url.searchParams.get("pageSize"), 50, 1, 100);
    return NextResponse.json({ bcId: String(bcId), data: await fetchUserLogs(await requireApiKey(), bcId, page, pageSize), refreshedAt: new Date().toISOString() });
  } catch (error) { return jsonError(error); }
}
