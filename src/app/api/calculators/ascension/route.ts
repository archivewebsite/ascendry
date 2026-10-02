import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateAscensionTarget, calculateMaxAffordable } from "@/lib/ascension";
import { jsonError, readJsonRequest } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const position = z.object({ tier: z.number().int().min(0).max(100_000), rank: z.number().int().min(1).max(58) });
const bodySchema = z.object({
  mode: z.enum(["target", "max"]),
  current: position,
  target: position.optional(),
  balance: z.string().regex(/^\d+$/),
  perks: z.object({ nepotism: z.number().int().min(0).max(20), anointment: z.number().int().min(0).max(20) }),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJsonRequest(request));
    const result = body.mode === "target"
      ? calculateAscensionTarget(body.current, body.target ?? body.current, BigInt(body.balance), body.perks)
      : calculateMaxAffordable(body.current, BigInt(body.balance), body.perks);
    return NextResponse.json({ result });
  } catch (error) { return jsonError(error); }
}
