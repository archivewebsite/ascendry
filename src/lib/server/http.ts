import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BconomyApiError } from "@/lib/server/bconomy";
import { InputError } from "@/lib/input";

class MutationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function assertMutationRequest(request: Request) {
  const requestUrl = new URL(request.url);
  // Next can construct an internal URL with its configured address. The HTTP
  // Host is the address the browser actually requested; forwarded hosts are ignored.
  let target: URL;
  try { target = new URL(`${requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`); }
  catch { throw new MutationError("Invalid local request host.", 403); }
  const origin = request.headers.get("origin");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.username || target.password
    || (origin && origin !== target.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new MutationError("Cross-origin writes are not allowed.", 403);
  }
}

export async function readJsonRequest(request: Request): Promise<unknown> {
  assertMutationRequest(request);
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new MutationError("Expected application/json.", 415);
  }
  try { return await request.json(); }
  catch { throw new InputError("The request body must contain valid JSON."); }
}

export function jsonError(error: unknown) {
  if (error instanceof MutationError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof ZodError) return NextResponse.json({ error: "The response or request did not match the expected schema.", details: error.issues.map((issue) => issue.message) }, { status: 422 });
  if (error instanceof BconomyApiError) return NextResponse.json({ error: error.message }, { status: error.status === 401 || error.status === 403 ? 401 : error.status === 429 ? 429 : 502 });
  const message = error instanceof Error ? error.message : "Unexpected local error.";
  return NextResponse.json({ error: message }, { status: 500 });
}
