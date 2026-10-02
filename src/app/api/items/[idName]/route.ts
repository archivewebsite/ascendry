import { NextResponse } from "next/server";
import { getCatalog, getItem, localPriceHistory } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ idName: string }> }) {
  const { idName } = await context.params;
  const item = getItem(idName);
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  const names = new Map(getCatalog().map((entry) => [entry.idName, entry.name]));
  return NextResponse.json({ item, uses: item.usedToCraft.map((usedBy) => ({ idName: usedBy, name: names.get(usedBy) ?? usedBy })), localHistory: localPriceHistory(idName) });
}
