import "server-only";

import { BconomyApiError } from "@/lib/server/bconomy";
import { loadApiKey } from "@/lib/server/credential";
import { InputError } from "@/lib/input";
export { parseBcId } from "@/lib/input";

export async function requireApiKey() {
  let apiKey: string | null;
  try { apiKey = await loadApiKey(); }
  catch { throw new BconomyApiError("The saved Bconomy API key could not be decrypted. Reconnect it in Settings.", 401, false); }
  if (!apiKey) throw new BconomyApiError("Connect a Bconomy API key in Settings first.", 401, false);
  return apiKey;
}

export function finiteInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new InputError(`Expected a whole number from ${minimum} to ${maximum}.`);
  return parsed;
}
