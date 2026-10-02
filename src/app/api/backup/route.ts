import { NextResponse } from "next/server";
import { exportBackup, importBackup } from "@/lib/server/db";
import { jsonError, readJsonRequest } from "@/lib/server/http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(exportBackup(), { headers: { "Content-Disposition": `attachment; filename="ascendry-backup-${new Date().toISOString().slice(0, 10)}.json"` } }); }
export async function POST(request: Request) { try { importBackup(await readJsonRequest(request)); return NextResponse.json({ imported: true }); } catch (error) { return jsonError(error); } }
