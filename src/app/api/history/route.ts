import { NextResponse } from "next/server";
import { deleteHistory } from "@/lib/server/db";
import { assertMutationRequest, jsonError } from "@/lib/server/http";
export const runtime = "nodejs";
export async function DELETE(request: Request) { try { assertMutationRequest(request); deleteHistory(); return new NextResponse(null, { status: 204 }); } catch (error) { return jsonError(error); } }
