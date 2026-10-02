import { NextResponse } from "next/server";
import { searchUsers } from "@/lib/server/bconomy";
import { jsonError } from "@/lib/server/http";
import { requireApiKey } from "@/lib/server/player-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (query.length < 2) return NextResponse.json({ users: [] });
    if (query.length > 80) return NextResponse.json({ error: "Search is too long." }, { status: 400 });
    return NextResponse.json({ users: await searchUsers(await requireApiKey(), query) });
  } catch (error) { return jsonError(error); }
}
