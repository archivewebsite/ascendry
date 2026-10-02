import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").toLowerCase();
  const craftable = url.searchParams.get("craftable");
  let items = getCatalog();
  if (query) items = items.filter((item) => `${item.name} ${item.idName} ${item.lootSources.join(" ")} ${item.attributes.join(" ")}`.toLowerCase().includes(query));
  if (craftable === "true") items = items.filter((item) => item.craftable);
  if (craftable === "false") items = items.filter((item) => !item.craftable);
  return NextResponse.json({ items, count: items.length });
}
