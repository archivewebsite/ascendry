import "server-only";

import { calculateProfitability, fillOrderBook } from "@/lib/market-math";
import { optimizeOrderBookPlan, reachableCatalogItems, type ProductionPlan } from "@/lib/server/crafting-optimizer";
import type {
  CatalogItem,
  CraftComparison,
  CraftRecommendation,
  CraftRequest,
  CraftResult,
  CraftTreeNode,
  ShoppingLine,
} from "@/lib/types";

function min(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function comparison(plan: ProductionPlan): CraftComparison {
  return {
    knownCost: plan.knownCost,
    complete: plan.complete,
    fulfilledQuantity: plan.fulfilledQuantity,
    unfilledQuantity: plan.unfilledQuantity,
  };
}

function directBuyComparison(request: CraftRequest, target: CatalogItem, quantity: bigint): CraftComparison {
  const override = request.manualPriceOverrides[target.idName];
  if (override !== undefined) {
    return { knownCost: (BigInt(override) * quantity).toString(), complete: true, fulfilledQuantity: quantity.toString(), unfilledQuantity: "0" };
  }
  const fill = fillOrderBook(quantity, request.orderBooks?.[target.idName] ?? []);
  return {
    knownCost: fill.knownCost.toString(),
    complete: fill.unfilled === 0n,
    fulfilledQuantity: fill.filled.toString(),
    unfilledQuantity: fill.unfilled.toString(),
  };
}

function recommendationFor(plan: ProductionPlan, targetId: string): CraftRecommendation {
  const target = plan.decisions.find((decision) => decision.idName === targetId);
  if (!target || BigInt(plan.fulfilledQuantity) === 0n) return "unavailable";
  const bought = BigInt(target.buyQuantity);
  const crafted = BigInt(target.craftQuantity);
  if (bought > 0n && crafted > 0n) return "mix";
  if (crafted > 0n) return "craft";
  return "buy";
}

function recommendationSummary(plan: ProductionPlan, targetId: string): string {
  const target = plan.decisions.find((decision) => decision.idName === targetId);
  if (!target || BigInt(plan.fulfilledQuantity) === 0n) return `${plan.unfilledQuantity} unfilled`;
  const parts: string[] = [];
  if (BigInt(target.buyQuantity) > 0n) parts.push(`Buy ${target.buyQuantity}`);
  if (BigInt(target.craftQuantity) > 0n) parts.push(`${parts.length ? "craft" : "Craft"} ${target.craftQuantity}`);
  let summary = parts.join(" and ");
  if (BigInt(plan.unfilledQuantity) > 0n) summary += ` · ${plan.unfilledQuantity} unfilled`;
  return summary;
}

function buildDecisionTree(target: CatalogItem, requested: bigint, catalog: CatalogItem[], plan: ProductionPlan): CraftTreeNode {
  const items = new Map(catalog.map((item) => [item.idName, item]));
  const allocation = new Map(plan.decisions.map((decision) => [decision.idName, {
    buy: BigInt(decision.buyQuantity),
    craft: BigInt(decision.craftQuantity),
    buyCost: BigInt(decision.buyCost),
    source: decision.priceSource,
  }]));

  function take(idName: string, demand: bigint): CraftTreeNode {
    const item = items.get(idName);
    if (!item) throw new Error(`Unknown recipe ingredient: ${idName}.`);
    const available = allocation.get(idName) ?? { buy: 0n, craft: 0n, buyCost: 0n, source: "missing" as const };
    const bought = min(available.buy, demand);
    const crafted = min(available.craft, demand - bought);
    const unfilled = demand - bought - crafted;
    const allocatedBuyCost = bought === 0n || available.buy === 0n
      ? 0n
      : bought === available.buy
        ? available.buyCost
        : (available.buyCost * bought) / available.buy;
    available.buy -= bought;
    available.craft -= crafted;
    available.buyCost -= allocatedBuyCost;
    allocation.set(idName, available);

    const children = crafted > 0n
      ? item.recipe.map((ingredient) => take(ingredient.ingredientIdName, crafted * BigInt(ingredient.amount)))
      : [];
    const childCost = children.reduce((sum, child) => sum + BigInt(child.subtotal ?? "0"), 0n);
    const subtotal = allocatedBuyCost + childCost;
    const action: CraftTreeNode["action"] = bought > 0n && crafted > 0n
      ? "mix"
      : crafted > 0n
        ? "craft"
        : bought > 0n
          ? "buy"
          : "raw";
    return {
      idName,
      name: item.name,
      quantity: demand.toString(),
      action,
      unitPrice: demand > 0n ? (subtotal / demand).toString() : null,
      subtotal: subtotal.toString(),
      priceSource: bought > 0n ? available.source : unfilled > 0n ? "missing" : "market",
      buyQuantity: bought.toString(),
      craftQuantity: crafted.toString(),
      unfilledQuantity: unfilled.toString(),
      children,
    };
  }

  return take(target.idName, requested);
}

function shoppingList(
  plan: ProductionPlan,
  request: CraftRequest,
  catalog: CatalogItem[],
): { lines: ShoppingLine[]; knownLowestTotal: bigint; missingPrices: string[] } {
  const items = new Map(catalog.map((item) => [item.idName, item]));
  let knownLowestTotal = 0n;
  const missingPrices: string[] = [];
  const purchased = plan.decisions.filter((decision) => BigInt(decision.buyQuantity) > 0n);
  const knownOrderBookTotal = BigInt(plan.knownCost);
  const lines = purchased.map((decision): ShoppingLine => {
    const item = items.get(decision.idName);
    if (!item) throw new Error(`Optimized plan references an unknown item: ${decision.idName}.`);
    const quantity = BigInt(decision.buyQuantity);
    const orderBookCost = BigInt(decision.buyCost);
    const override = request.manualPriceOverrides[decision.idName];
    const lowestUnit = override !== undefined
      ? BigInt(override)
      : item.market?.price === null || item.market?.price === undefined
        ? null
        : BigInt(item.market.price);
    const lowestCost = lowestUnit === null ? null : lowestUnit * quantity;
    if (lowestCost === null) missingPrices.push(decision.idName);
    else knownLowestTotal += lowestCost;
    return {
      idName: decision.idName,
      name: decision.name,
      quantity: decision.buyQuantity,
      unitPrice: quantity === 0n ? null : (orderBookCost / quantity).toString(),
      lowestCost: lowestCost?.toString() ?? null,
      orderBookCost: decision.buyCost,
      filledQuantity: decision.buyQuantity,
      unfilledQuantity: "0",
      priceSource: decision.priceSource,
      decision: "buy",
      percentOfKnownCost: knownOrderBookTotal === 0n ? 0 : Number((orderBookCost * 10_000n) / knownOrderBookTotal) / 100,
    };
  }).sort((left, right) => right.percentOfKnownCost - left.percentOfKnownCost);
  return { lines, knownLowestTotal, missingPrices };
}

function saving(comparisonPlan: CraftComparison, optimized: ProductionPlan): string | null {
  if (!comparisonPlan.complete || !optimized.complete) return null;
  const difference = BigInt(comparisonPlan.knownCost) - BigInt(optimized.knownCost);
  return difference >= 0n ? difference.toString() : null;
}

async function resultFromPlan(request: CraftRequest, catalog: CatalogItem[], optimized: ProductionPlan): Promise<CraftResult> {
  const quantity = BigInt(request.quantity);
  const target = catalog.find((item) => item.idName === request.idName);
  if (!target) throw new Error("The selected item is not in the catalog.");

  const craftAll = quantity === 0n
    ? { fulfilledQuantity: "0", unfilledQuantity: "0", knownCost: "0", complete: true, decisions: [] }
    : await optimizeOrderBookPlan(request, catalog, "craft-all");
  const directBuy = directBuyComparison(request, target, quantity);
  const optimizedComparison = comparison(optimized);
  const craftAllComparison = comparison(craftAll);
  const purchases = shoppingList(optimized, request, catalog);
  const recommendation = recommendationFor(optimized, target.idName);
  const complete = optimized.complete;
  const selectedKnownTotal = BigInt(optimized.knownCost);
  const salePrice = request.salePrice
    ? BigInt(request.salePrice)
    : target.market?.price === null || target.market?.price === undefined
      ? null
      : BigInt(target.market.price);
  const profitability = calculateProfitability({
    quantity,
    saleUnitPrice: salePrice,
    materialCost: complete ? selectedKnownTotal : null,
    insiderLevel: request.profile.levels.insider ?? 0,
    mercantilistLevel: request.profile.levels.mercantilist ?? 0,
    requiredMercantilistLevel: target.mercantilistLevel,
  });

  const decisions = optimized.decisions.filter((decision) =>
    decision.idName === target.idName || BigInt(decision.requiredQuantity) > 0n,
  );
  return {
    target: { idName: target.idName, name: target.name, quantity: quantity.toString() },
    recipeMode: "optimized",
    priceMode: "orderbook",
    marketSnapshotAt: catalog.find((item) => item.market)?.market?.snapshotAt ?? null,
    tree: buildDecisionTree(target, quantity, catalog, optimized),
    shoppingList: purchases.lines,
    knownLowestTotal: purchases.knownLowestTotal.toString(),
    knownOrderBookTotal: optimized.knownCost,
    selectedKnownTotal: optimized.knownCost,
    complete,
    custom: Object.keys(request.manualPriceOverrides).length > 0,
    missingPrices: purchases.missingPrices,
    orderBookUnfilled: BigInt(optimized.unfilledQuantity) > 0n ? { [target.idName]: optimized.unfilledQuantity } : {},
    budgetCapacity: null,
    profitability,
    recommendation,
    recommendationSummary: recommendationSummary(optimized, target.idName),
    fulfilledQuantity: optimized.fulfilledQuantity,
    unfilledQuantity: optimized.unfilledQuantity,
    decisions,
    comparisons: { directBuy, craftAll: craftAllComparison, optimized: optimizedComparison },
    savingsVsBuy: saving(directBuy, optimized),
    savingsVsCraft: saving(craftAllComparison, optimized),
  };
}

export async function calculateOptimizedOrderBookCraft(request: CraftRequest, catalog: CatalogItem[]): Promise<CraftResult> {
  const optimized = await optimizeOrderBookPlan(request, catalog);
  return resultFromPlan(request, catalog, optimized);
}

function hasUnlimitedFreePath(idName: string, request: CraftRequest, catalog: Map<string, CatalogItem>, visiting = new Set<string>()): boolean {
  const override = request.manualPriceOverrides[idName];
  if (override !== undefined && BigInt(override) === 0n) return true;
  const item = catalog.get(idName);
  if (!item?.craftable || item.recipe.length === 0 || visiting.has(idName)) return false;
  const next = new Set(visiting).add(idName);
  return item.recipe.every((ingredient) => hasUnlimitedFreePath(ingredient.ingredientIdName, request, catalog, next));
}

function normalizeBudgetPlan(plan: ProductionPlan, targetId: string): ProductionPlan {
  const quantity = BigInt(plan.fulfilledQuantity);
  return {
    ...plan,
    complete: true,
    unfilledQuantity: "0",
    decisions: plan.decisions.map((decision) => decision.idName === targetId
      ? { ...decision, requiredQuantity: quantity.toString(), unfilledQuantity: "0" }
      : decision),
  };
}

export async function calculateOptimizedOrderBookCraftFromBudget(request: CraftRequest, catalog: CatalogItem[]): Promise<CraftResult> {
  if (!request.budget) throw new Error("Enter a budget.");
  const budget = BigInt(request.budget);
  if (budget <= 0n) throw new Error("Budget must be greater than zero.");
  const byName = new Map(catalog.map((item) => [item.idName, item]));
  if (hasUnlimitedFreePath(request.idName, request, byName)) {
    throw new Error("This plan has a free unlimited path, so a finite budget maximum cannot be calculated.");
  }

  const reachable = reachableCatalogItems(request.idName, catalog);
  const listedSupply = reachable.reduce((total, item) => total + (request.orderBooks?.[item.idName] ?? []).reduce((sum, listing) => sum + BigInt(listing.amount), 0n), 0n);
  const capacityLimit = budget + listedSupply + 1n;
  const capacityRequest: CraftRequest = { ...request, targetMode: "budget", quantity: capacityLimit.toString(), budget: undefined };
  const constrained = await optimizeOrderBookPlan(capacityRequest, catalog, "lowest-cost", budget);
  const quantity = BigInt(constrained.fulfilledQuantity);
  const optimized = normalizeBudgetPlan(constrained, request.idName);
  const resultRequest: CraftRequest = { ...request, targetMode: "budget", quantity: quantity.toString(), budget: undefined };
  const result = await resultFromPlan(resultRequest, catalog, optimized);

  const nextRequest: CraftRequest = { ...resultRequest, quantity: (quantity + 1n).toString() };
  const next = await optimizeOrderBookPlan(nextRequest, catalog);
  const nextCost = next.complete ? BigInt(next.knownCost) : null;
  const spent = BigInt(result.selectedKnownTotal);
  if (spent > budget) throw new Error("The calculated plan exceeds the submitted budget.");
  return {
    ...result,
    budget: {
      limit: budget.toString(),
      spent: spent.toString(),
      unspent: (budget - spent).toString(),
      averageUnitCost: quantity === 0n ? null : (spent / quantity).toString(),
      limitingFactor: next.complete ? "budget" : "market-depth",
      nextUnitShortfall: nextCost !== null && nextCost > budget ? (nextCost - budget).toString() : null,
    },
  };
}
