import { NextResponse } from "next/server";
import { planInputSchema } from "@/lib/plan-schema";
import { listPlans, savePlan } from "@/lib/server/db";
import { jsonError, readJsonRequest } from "@/lib/server/http";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ plans: listPlans() }); }
export async function POST(request: Request) { try { const value = planInputSchema.parse(await readJsonRequest(request)); return NextResponse.json({ plan: savePlan(value) }, { status: 201 }); } catch (error) { return jsonError(error); } }
