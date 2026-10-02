import { NextResponse } from "next/server";
import { z } from "zod";
import { listAlerts, saveAlert } from "@/lib/server/db";
import { jsonError, readJsonRequest } from "@/lib/server/http";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ alerts: listAlerts() }); }
export async function POST(request: Request) { try { const value = z.object({ idName: z.string().min(1), direction: z.enum(["below", "above"]), threshold: z.string().regex(/^\d+$/), enabled: z.boolean().default(true) }).parse(await readJsonRequest(request)); return NextResponse.json({ alert: saveAlert(value) }, { status: 201 }); } catch (error) { return jsonError(error); } }
