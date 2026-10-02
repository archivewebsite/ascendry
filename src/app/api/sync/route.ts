import { NextResponse } from "next/server";
import { loadApiKey } from "@/lib/server/credential";
import { fetchSyncData } from "@/lib/server/bconomy";
import { diagnostics, recordSyncError, storeSync } from "@/lib/server/db";
import { assertMutationRequest, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try { assertMutationRequest(request); } catch (error) { return jsonError(error); }
  try {
    const apiKey = await loadApiKey();
    if (!apiKey) return NextResponse.json({ error: "Connect a Bconomy API key first." }, { status: 401 });
    const data = await fetchSyncData(apiKey);
    const sync = storeSync(data.items, data.preview);
    return NextResponse.json({ sync, diagnostics: diagnostics() });
  } catch (error) {
    recordSyncError(error instanceof Error ? error.message : "Refresh failed.");
    return jsonError(error);
  }
}
