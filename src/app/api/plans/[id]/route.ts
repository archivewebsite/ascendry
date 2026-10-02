import { NextResponse } from "next/server";
import { planInputSchema } from "@/lib/plan-schema";
import { deletePlan, getPlan, savePlan } from "@/lib/server/db";
import { assertMutationRequest, jsonError, readJsonRequest } from "@/lib/server/http";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_r: Request, c: { params: Promise<{ id: string }> }) { const { id } = await c.params; const plan = getPlan(id); return plan ? NextResponse.json({ plan }) : NextResponse.json({ error: "Plan not found." }, { status: 404 }); }
export async function PUT(r: Request, c: { params: Promise<{ id: string }> }) { try { const { id } = await c.params; const value = planInputSchema.parse(await readJsonRequest(r)); return NextResponse.json({ plan: savePlan({ id, ...value }) }); } catch (error) { return jsonError(error); } }
export async function DELETE(r: Request, c: { params: Promise<{ id: string }> }) { try { assertMutationRequest(r); const { id } = await c.params; deletePlan(id); return new NextResponse(null, { status: 204 }); } catch (error) { return jsonError(error); } }
