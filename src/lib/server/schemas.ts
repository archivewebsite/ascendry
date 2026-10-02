import { z } from "zod";
import { normalizeDecimalString } from "@/lib/quantity";

const integerText = z.unknown().transform((value, context) => {
  try { return normalizeDecimalString(value); }
  catch { context.addIssue({ code: "custom", message: "Expected an exact integer." }); return z.NEVER; }
});
const nonnegativeIntegerText = integerText.pipe(z.string().refine((value) => BigInt(value) >= 0n, "Expected a non-negative integer."));
const positiveIntegerText = integerText.pipe(z.string().refine((value) => BigInt(value) > 0n, "Expected a positive integer."));

// json-bigint deliberately returns every integer as text so values above
// Number.MAX_SAFE_INTEGER are never rounded. IDs are bounded API identifiers,
// so coerce only those known-small fields back to safe JavaScript numbers.
const safeIntegerNumber = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    context.addIssue({ code: "custom", message: "Expected a safe integer identifier." });
    return z.NEVER;
  }
  return parsed;
});

export const itemDataSchema = z.array(z.object({
  id: safeIntegerNumber.pipe(z.number().nonnegative()),
  idName: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().default(""),
  imageUrl: z.string().url().nullish(),
  desc: z.string().nullish(),
  cost: nonnegativeIntegerText,
  damage: nonnegativeIntegerText.nullish(),
  uncraftable: z.boolean(),
  attributes: z.array(z.string()).default([]),
  lootSources: z.array(z.string()).default([]),
  recipe: z.array(z.tuple([z.string(), positiveIntegerText])).default([]),
  usedToCraft: z.array(z.string()).default([]),
}).passthrough()).superRefine((items, context) => {
  const ids = new Set<number>();
  const names = new Set<string>();
  const idNames = new Set(items.map((item) => item.idName));
  const expectedBacklinks = new Map(items.map((item) => [item.idName, [] as string[]]));
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate item id." });
    if (names.has(item.idName)) context.addIssue({ code: "custom", path: [index, "idName"], message: "Duplicate item idName." });
    ids.add(item.id); names.add(item.idName);
    if (item.uncraftable !== (item.recipe.length === 0)) context.addIssue({ code: "custom", path: [index, "recipe"], message: "Recipe and uncraftable flag disagree." });
    for (const [ingredient] of item.recipe) {
      if (!idNames.has(ingredient)) context.addIssue({ code: "custom", path: [index, "recipe"], message: `Unknown ingredient ${ingredient}.` });
      else expectedBacklinks.get(ingredient)?.push(item.idName);
    }
  }
  for (const [index, item] of items.entries()) {
    const actual = [...new Set(item.usedToCraft)].sort();
    const expected = [...new Set(expectedBacklinks.get(item.idName) ?? [])].sort();
    if (actual.join("\0") !== expected.join("\0")) context.addIssue({ code: "custom", path: [index, "usedToCraft"], message: "Recipe backlinks disagree with ingredient usage." });
  }
});

const finiteDelta = z.union([z.number(), z.string()]).transform((value, context) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    context.addIssue({ code: "custom", message: "Expected a finite percentage change." });
    return z.NEVER;
  }
  return parsed;
}).nullable();
export const marketPreviewSchema = z.object({
  lastUpdated: z.union([z.number(), z.string()]).transform((value) => String(value)),
  data: z.record(z.string(), z.object({
    price: nonnegativeIntegerText.optional(),
    delta: z.object({ day: finiteDelta, week: finiteDelta, month: finiteDelta }),
  })),
});

export const listingSchema = z.array(z.object({ id: nonnegativeIntegerText, bcId: nonnegativeIntegerText, itemId: safeIntegerNumber, price: nonnegativeIntegerText, amount: positiveIntegerText }).passthrough()).superRefine((listings, context) => {
  const ids = new Set<string>();
  for (const [index, listing] of listings.entries()) {
    if (ids.has(listing.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate listing id." });
    ids.add(listing.id);
  }
});
export const transactionSchema = z.array(z.object({
  itemId: safeIntegerNumber, itemName: z.string(), itemEmoji: z.string().default(""), type: z.enum(["buy", "list", "delist"]), actorBcId: integerText, actorName: z.string(), amount: integerText, price: integerText, date: z.string(),
}).passthrough());
export const priceHistorySchema = z.array(z.object({ id: integerText, snapshotTime: z.string(), itemId: safeIntegerNumber, lowestPrice: integerText.nullable() }).passthrough());
export const volumeHistorySchema = z.array(z.object({
  id: integerText, granularity: z.enum(["hour", "day", "month"]), windowStart: z.string(), windowEnd: z.string(), itemId: safeIntegerNumber, unitsSold: integerText, totalRevenue: integerText, transactionCount: integerText,
}).passthrough());

export type ItemData = z.infer<typeof itemDataSchema>;
export type MarketPreview = z.infer<typeof marketPreviewSchema>;
