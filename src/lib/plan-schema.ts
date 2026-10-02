import { z } from "zod";
import { validatePrestigeLevels } from "@/lib/prestige";
import type { CraftTreeNode } from "@/lib/types";

export const integerString = z.string().regex(/^-?\d+$/).transform((value) => BigInt(value).toString());
export const nonnegativeString = integerString.refine((value) => BigInt(value) >= 0n, "Expected a non-negative integer.");
const positiveString = nonnegativeString.refine((value) => BigInt(value) > 0n, "Expected a positive integer.");
export const timestampSchema = z.union([z.string().min(1), z.number().finite()]).transform((value, context) => {
  const time = typeof value === "number" || /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(time) || Math.abs(time) > 8.64e15) {
    context.addIssue({ code: "custom", message: "Expected a valid timestamp." });
    return z.NEVER;
  }
  return new Date(time).toISOString();
});
const nullableAmount = nonnegativeString.nullable();
const finite = z.number().finite();
const recipeMode = z.enum(["direct", "recursive", "optimized"]);
const priceMode = z.enum(["lowest", "orderbook"]);
const priceSource = z.enum(["market", "override", "missing"]);
export const profileSchema = z.object({
  id: z.string().trim().min(1).optional(), name: z.string().trim().min(1),
  levels: z.record(z.string(), z.number().int()), capturedAt: timestampSchema.optional(),
}).superRefine((profile, context) => {
  try { validatePrestigeLevels(profile.levels); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid Prestige levels." }); }
});
const treeSchema: z.ZodType<CraftTreeNode> = z.lazy(() => z.object({
  idName: z.string().min(1), name: z.string().min(1), quantity: nonnegativeString,
  action: z.enum(["craft", "buy", "mix", "raw"]), unitPrice: nullableAmount, subtotal: nullableAmount, priceSource,
  buyQuantity: nonnegativeString.optional(), craftQuantity: nonnegativeString.optional(), unfilledQuantity: nonnegativeString.optional(),
  children: z.array(treeSchema),
}));
const comparisonSchema = z.object({ knownCost: nonnegativeString, complete: z.boolean(), fulfilledQuantity: nonnegativeString, unfilledQuantity: nonnegativeString });
export const craftResultSchema = z.object({
  target: z.object({ idName: z.string().min(1), name: z.string().min(1), quantity: nonnegativeString }), recipeMode, priceMode,
  marketSnapshotAt: timestampSchema.nullable(), tree: treeSchema,
  shoppingList: z.array(z.object({
    idName: z.string().min(1), name: z.string().min(1), quantity: nonnegativeString, unitPrice: nullableAmount,
    lowestCost: nullableAmount, orderBookCost: nullableAmount, filledQuantity: nonnegativeString, unfilledQuantity: nonnegativeString,
    priceSource, decision: z.enum(["buy", "raw"]), percentOfKnownCost: finite,
  })),
  knownLowestTotal: nonnegativeString, knownOrderBookTotal: nonnegativeString, selectedKnownTotal: nonnegativeString,
  complete: z.boolean(), custom: z.boolean(), missingPrices: z.array(z.string()), orderBookUnfilled: z.record(z.string(), nonnegativeString),
  budgetCapacity: z.object({ lowest: nullableAmount, orderBook: nullableAmount }).nullable(),
  budget: z.object({ limit: positiveString, spent: nonnegativeString, unspent: nonnegativeString, averageUnitCost: nullableAmount,
    limitingFactor: z.enum(["budget", "market-depth", "unknown-supply"]), nextUnitShortfall: nullableAmount }).optional(),
  profitability: z.object({
    feeBps: z.number().int().min(0).max(10_000), gross: nullableAmount, fee: nullableAmount, net: nullableAmount,
    materialCost: nullableAmount, profit: integerString.nullable(), marginPercent: finite.nullable(), roiPercent: finite.nullable(),
    breakEvenListingPrice: nullableAmount, requiredMercantilistLevel: z.number().int().nonnegative().nullable(),
    eligibleToSell: z.boolean().nullable(), hypothetical: z.boolean(),
  }),
  recommendation: z.enum(["buy", "craft", "mix", "unavailable"]).optional(), recommendationSummary: z.string().optional(),
  fulfilledQuantity: nonnegativeString.optional(), unfilledQuantity: nonnegativeString.optional(),
  decisions: z.array(z.object({ idName: z.string(), name: z.string(), requiredQuantity: nonnegativeString, buyQuantity: nonnegativeString,
    craftQuantity: nonnegativeString, unfilledQuantity: nonnegativeString, buyCost: nonnegativeString, priceSource })).optional(),
  comparisons: z.object({ directBuy: comparisonSchema, craftAll: comparisonSchema, optimized: comparisonSchema }).optional(),
  savingsVsBuy: integerString.nullable().optional(), savingsVsCraft: integerString.nullable().optional(),
});
const payloadSchema = z.object({
  idName: z.string().min(1), quantity: nonnegativeString, targetMode: z.enum(["quantity", "budget"]).optional(), recipeMode, priceMode,
  profile: profileSchema, manualPriceOverrides: z.record(z.string(), nonnegativeString),
  salePrice: nonnegativeString.optional(), budget: positiveString.optional(), marketSnapshotAt: timestampSchema.nullable(),
}).superRefine((value, context) => {
  if (value.targetMode !== "budget" && BigInt(value.quantity) === 0n) context.addIssue({ code: "custom", message: "Quantity must be positive." });
  if (value.targetMode === "budget" && !value.budget) context.addIssue({ code: "custom", message: "A budget plan requires its budget." });
});
export const planInputSchema = z.object({ name: z.string().trim().min(1).max(120), payload: payloadSchema, result: craftResultSchema }).superRefine((plan, context) => {
  if (plan.payload.idName !== plan.result.target.idName || plan.payload.quantity !== plan.result.target.quantity
    || plan.payload.recipeMode !== plan.result.recipeMode || plan.payload.priceMode !== plan.result.priceMode) {
    context.addIssue({ code: "custom", message: "Plan inputs and result describe different calculations." });
  }
});

export function parsePlanImport(value: unknown) {
  const record = z.record(z.string(), z.unknown()).parse(value);
  if (record.schemaVersion !== undefined && record.schemaVersion !== 1) throw new Error("Unsupported plan file version.");
  const incoming = "plans" in record ? z.array(z.unknown()).parse(record.plans) : [record];
  return incoming.map((entry) => {
    const plan = z.record(z.string(), z.unknown()).parse(entry);
    if ("request" in plan) {
      const request = z.record(z.string(), z.unknown()).parse(plan.request);
      const result = craftResultSchema.parse(plan.result);
      return planInputSchema.parse({ name: `${result.target.name} × ${result.target.quantity}`, payload: { ...request, marketSnapshotAt: result.marketSnapshotAt }, result });
    }
    return planInputSchema.parse(plan);
  });
}
