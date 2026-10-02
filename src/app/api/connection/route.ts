import { NextResponse } from "next/server";
import { z } from "zod";
import { clearApiKey, loadApiKey, saveApiKey } from "@/lib/server/credential";
import { fetchSyncData } from "@/lib/server/bconomy";
import { diagnostics, recordSyncError, storeSync } from "@/lib/server/db";
import { assertMutationRequest, jsonError, readJsonRequest } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ connected: Boolean(await loadApiKey()), diagnostics: diagnostics() });
  } catch {
    return NextResponse.json({ connected: false, credentialError: "The saved Bconomy API key cannot be opened in this Windows session. Enter it again in Settings to replace it.", diagnostics: diagnostics() });
  }
}

export async function POST(request: Request) {
  try { assertMutationRequest(request); } catch (error) { return jsonError(error); }
  try {
    const { apiKey } = z.object({ apiKey: z.string().trim().min(10).max(500) }).parse(await readJsonRequest(request));
    const data = await fetchSyncData(apiKey);
    const sync = storeSync(data.items, data.preview);
    await saveApiKey(apiKey);
    return NextResponse.json({ connected: true, sync, diagnostics: diagnostics() });
  } catch (error) {
    recordSyncError(error instanceof Error ? error.message : "Connection failed.");
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try { assertMutationRequest(request); await clearApiKey(); return NextResponse.json({ connected: false }); }
  catch (error) { return jsonError(error); }
}
