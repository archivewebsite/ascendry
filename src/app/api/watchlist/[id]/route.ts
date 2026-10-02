import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAlert, getAlert, saveAlert } from "@/lib/server/db";
import { assertMutationRequest, jsonError, readJsonRequest } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(_r: Request, c: { params: Promise<{ id: string }> }) { const { id } = await c.params; const alert = getAlert(id); return alert ? NextResponse.json({ alert }) : NextResponse.json({ error: "Alert not found." }, { status: 404 }); }
export async function PUT(request: Request, c: { params: Promise<{ id: string }> }) { try { const raw = await readJsonRequest(request); const { id } = await c.params; if (!getAlert(id)) return NextResponse.json({ error: "Alert not found." }, { status: 404 }); const value = z.object({ idName: z.string().min(1), direction: z.enum(["below", "above"]), threshold: z.string().regex(/^\d+$/), enabled: z.boolean() }).parse(raw); return NextResponse.json({ alert: saveAlert({ id, ...value }) }); } catch (error) { return jsonError(error); } }
export async function DELETE(r: Request, c: { params: Promise<{ id: string }> }) { try { assertMutationRequest(r); const { id } = await c.params; deleteAlert(id); return new NextResponse(null, { status: 204 }); } catch (error) { return jsonError(error); } }
