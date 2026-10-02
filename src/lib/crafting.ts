import { fillOrderBook, calculateProfitability, maxQuantityWithinBudget } from "@/lib/market-math";
import type { CatalogItem, CraftRequest, CraftResult, CraftTreeNode, ShoppingLine } from "@/lib/types";

interface BuildContext {
  items: Map<string, CatalogItem>;
  prices: Map<string, bigint>;
  overrides: Map<string, bigint>;
  mode: CraftRequest["recipeMode"];
  leaves: Map<string, { item: CatalogItem; quantity: bigint; source: "market" | "override" | "missing" }>;
  stack: Set<string>;
}

function priceFor(idName: string, context: BuildContext): { value: bigint | null; source: "market" | "override" | "missing" } {
  const override = context.overrides.get(idName);
  if (override !== undefined) return { value: override, source: "override" };
  const price = context.prices.get(idName);
  return price === undefined ? { value: null, source: "missing" } : { value: price, source: "market" };
}

function addLeaf(item: CatalogItem, quantity: bigint, context: BuildContext) {
  const existing = context.leaves.get(item.idName);
  const priced = priceFor(item.idName, context);
  context.leaves.set(item.idName, {
    item,
    quantity: (existing?.quantity ?? 0n) + quantity,
    source: priced.source,
  });
}

function recursiveUnitCost(item: CatalogItem, context: BuildContext, seen = new Set<string>()): bigint | null {
  if (seen.has(item.idName)) throw new Error(`Crafting cycle detected at ${item.name}.`);
  if (!item.craftable || item.recipe.length === 0) return priceFor(item.idName, context).value;
  const next = new Set(seen).add(item.idName);
  let total = 0n;
  for (const ingredient of item.recipe) {
    const child = context.items.get(ingredient.ingredientIdName);
    if (!child) throw new Error(`Recipe for ${item.name} references an unknown item.`);
    const buy = priceFor(child.idName, context).value;
    const craft = child.craftable ? recursiveUnitCost(child, context, next) : null;
    const unit = context.mode === "optimized" && buy !== null && craft !== null ? (buy <= craft ? buy : craft) : (craft ?? buy);
    if (unit === null) return null;
    total += unit * BigInt(ingredient.amount);
  }
  return total;
}

function buildNode(item: CatalogItem, quantity: bigint, context: BuildContext, forceCraftRoot = false): CraftTreeNode {
  if (context.stack.has(item.idName)) throw new Error(`Crafting cycle detected at ${item.name}.`);
  const priced = priceFor(item.idName, context);
  const canExpand = item.craftable && item.recipe.length > 0;
  let shouldCraft = forceCraftRoot || context.mode !== "optimized";

  if (!forceCraftRoot && context.mode === "optimized" && canExpand) {
    const craftUnit = recursiveUnitCost(item, context);
    shouldCraft = craftUnit !== null && (priced.value === null || craftUnit < priced.value);
  }

  if (!canExpand || !shouldCraft) {
    addLeaf(item, quantity, context);
    return {
      idName: item.idName,
      name: item.name,
      quantity: quantity.toString(),
      action: canExpand ? "buy" : priced.value === null ? "raw" : "buy",
      unitPrice: priced.value?.toString() ?? null,
      subtotal: priced.value === null ? null : (priced.value * quantity).toString(),
      priceSource: priced.source,
      children: [],
    };
  }

  context.stack.add(item.idName);
  const children = item.recipe.map((ingredient) => {
    const child = context.items.get(ingredient.ingredientIdName);
    if (!child) throw new Error(`Unknown recipe ingredient: ${ingredient.ingredientIdName}.`);
    const childQuantity = quantity * BigInt(ingredient.amount);
    if (context.mode === "direct") {
      addLeaf(child, childQuantity, context);
      const childPrice = priceFor(child.idName, context);
      return {
        idName: child.idName,
        name: child.name,
        quantity: childQuantity.toString(),
        action: child.craftable ? "buy" as const : childPrice.value === null ? "raw" as const : "buy" as const,
        unitPrice: childPrice.value?.toString() ?? null,
        subtotal: childPrice.value === null ? null : (childPrice.value * childQuantity).toString(),
        priceSource: childPrice.source,
        children: [],
      };
    }
    return buildNode(child, childQuantity, context);
  });
  context.stack.delete(item.idName);
  const knownSubtotal = children.reduce<bigint | null>((sum, child) => child.subtotal === null || sum === null ? null : sum + BigInt(child.subtotal), 0n);
  return {
    idName: item.idName,
    name: item.name,
    quantity: quantity.toString(),
    action: "craft",
    unitPrice: knownSubtotal === null || quantity === 0n ? null : (knownSubtotal / quantity).toString(),
    subtotal: knownSubtotal?.toString() ?? null,
    priceSource: knownSubtotal === null ? "missing" : "market",
    children,
  };
}

export function calculateCraft(request: CraftRequest, catalog: CatalogItem[]): CraftResult {
  const quantity = BigInt(request.quantity);
  if (quantity < 0n || (quantity === 0n && request.targetMode !== "budget")) throw new Error("Quantity must be positive.");
  const items = new Map(catalog.map((item) => [item.idName, item]));
  const target = items.get(request.idName);
  if (!target) throw new Error("The selected item is not in the catalog.");
  const overrides = new Map(Object.entries(request.manualPriceOverrides).map(([key, value]) => [key, BigInt(value)]));
  const prices = new Map<string, bigint>();
  for (const item of catalog) {
    if (item.market?.price !== null && item.market?.price !== undefined) prices.set(item.idName, BigInt(item.market.price));
  }
  const context: BuildContext = { items, prices, overrides, mode: request.recipeMode, leaves: new Map(), stack: new Set() };
  const forceCraftRoot = target.craftable && request.recipeMode !== "optimized";
  const tree = buildNode(target, quantity, context, forceCraftRoot);

  let knownLowestTotal = 0n;
  let knownOrderBookTotal = 0n;
  let lowestComplete = true;
  let orderBookComplete = true;
  const missingPrices: string[] = [];
  const orderBookUnfilled: Record<string, string> = {};
  const preliminary = [...context.leaves.values()].filter((leaf) => leaf.quantity > 0n).map((leaf) => {
    const priced = priceFor(leaf.item.idName, context);
    const lowestCost = priced.value === null ? null : priced.value * leaf.quantity;
    if (lowestCost === null) {
      lowestComplete = false;
      if (request.priceMode !== "orderbook") missingPrices.push(leaf.item.idName);
    }
    else knownLowestTotal += lowestCost;

    let orderBookCost: bigint | null = lowestCost;
    let filled = leaf.quantity;
    let unfilled = 0n;
    if (priced.source !== "override" && request.orderBooks?.[leaf.item.idName]) {
      const fill = fillOrderBook(leaf.quantity, request.orderBooks[leaf.item.idName]!);
      orderBookCost = fill.knownCost;
      filled = fill.filled;
      unfilled = fill.unfilled;
      if (unfilled > 0n) { orderBookComplete = false; if (request.priceMode === "orderbook") orderBookUnfilled[leaf.item.idName] = unfilled.toString(); }
    } else if (priced.source !== "override") {
      orderBookCost = null;
      filled = 0n;
      unfilled = leaf.quantity;
      orderBookComplete = false;
      if (request.priceMode === "orderbook") orderBookUnfilled[leaf.item.idName] = unfilled.toString();
    }
    if (orderBookCost !== null) knownOrderBookTotal += orderBookCost;
    return { leaf, priced, lowestCost, orderBookCost, filled, unfilled };
  });

  const denominator = request.priceMode === "orderbook" ? knownOrderBookTotal : knownLowestTotal;
  const shoppingList: ShoppingLine[] = preliminary.map(({ leaf, priced, lowestCost, orderBookCost, filled, unfilled }) => {
    const chosenCost = request.priceMode === "orderbook" ? orderBookCost : lowestCost;
    const percent = chosenCost === null || denominator === 0n ? 0 : Number((chosenCost * 10_000n) / denominator) / 100;
    return {
      idName: leaf.item.idName,
      name: leaf.item.name,
      quantity: leaf.quantity.toString(),
      unitPrice: priced.value?.toString() ?? null,
      lowestCost: lowestCost?.toString() ?? null,
      orderBookCost: orderBookCost?.toString() ?? null,
      filledQuantity: (request.priceMode === "lowest" ? lowestCost === null ? 0n : leaf.quantity : filled).toString(),
      unfilledQuantity: (request.priceMode === "lowest" ? lowestCost === null ? leaf.quantity : 0n : unfilled).toString(),
      priceSource: priced.source,
      decision: priced.value === null ? "raw" as const : "buy" as const,
      percentOfKnownCost: percent,
    };
  }).sort((a, b) => b.percentOfKnownCost - a.percentOfKnownCost);

  const selectedKnownTotal = request.priceMode === "orderbook" ? knownOrderBookTotal : knownLowestTotal;
  const complete = request.priceMode === "orderbook" ? orderBookComplete : lowestComplete;
  const salePrice = request.salePrice ? BigInt(request.salePrice) : prices.get(target.idName) ?? null;
  const insider = request.profile.levels.insider ?? 0;
  const mercantilist = request.profile.levels.mercantilist ?? 0;
  const profitability = calculateProfitability({
    quantity,
    saleUnitPrice: salePrice,
    materialCost: complete ? selectedKnownTotal : null,
    insiderLevel: insider,
    mercantilistLevel: mercantilist,
    requiredMercantilistLevel: target.mercantilistLevel,
  });

  let budgetCapacity: CraftResult["budgetCapacity"] = null;
  if (request.budget) {
    const budget = BigInt(request.budget);
    const withoutBudget = { ...request, budget: undefined, salePrice: undefined };
    const capacityFor = (mode: CraftRequest["priceMode"]) => maxQuantityWithinBudget(budget, (candidateQuantity) => {
      if (candidateQuantity === 0n) return 0n;
      const candidate = calculateCraft({ ...withoutBudget, quantity: candidateQuantity.toString(), priceMode: mode }, catalog);
      return candidate.complete ? BigInt(candidate.selectedKnownTotal) : null;
    }).toString();
    const lowest = lowestComplete ? capacityFor("lowest") : null;
    const orderBook = request.orderBooks && Object.keys(request.orderBooks).length > 0 ? capacityFor("orderbook") : null;
    budgetCapacity = { lowest, orderBook };
  }

  return {
    target: { idName: target.idName, name: target.name, quantity: quantity.toString() },
    recipeMode: request.recipeMode,
    priceMode: request.priceMode,
    marketSnapshotAt: catalog.find((item) => item.market)?.market?.snapshotAt ?? null,
    tree,
    shoppingList,
    knownLowestTotal: knownLowestTotal.toString(),
    knownOrderBookTotal: knownOrderBookTotal.toString(),
    selectedKnownTotal: selectedKnownTotal.toString(),
    complete,
    custom: overrides.size > 0,
    missingPrices,
    orderBookUnfilled,
    budgetCapacity,
    profitability,
    ...(request.recipeMode === "optimized" ? {
      recommendation: !complete || quantity === 0n || tree.action === "raw" ? "unavailable" as const : tree.action,
      recommendationSummary: !complete ? "No complete priced path" : quantity === 0n ? "No complete item is affordable" : tree.action === "buy" ? `Buy ${quantity.toString()}` : tree.action === "craft" ? `Craft ${quantity.toString()}` : "No complete priced path",
      fulfilledQuantity: complete ? quantity.toString() : "0",
      unfilledQuantity: complete ? "0" : quantity.toString(),
    } : {}),
  };
}

export function calculateCraftFromBudget(request: CraftRequest, catalog: CatalogItem[]): CraftResult {
  if (!request.budget) throw new Error("Enter a budget.");
  const budget = BigInt(request.budget);
  if (budget <= 0n) throw new Error("Budget must be greater than zero.");
  const baseRequest: CraftRequest = { ...request, targetMode: "budget", budget: undefined, salePrice: request.salePrice };
  const calculate = (quantity: bigint) => calculateCraft({ ...baseRequest, quantity: quantity.toString() }, catalog);
  const first = calculate(1n);

  if (!first.complete) {
    const empty = calculate(0n);
    return {
      ...empty,
      complete: false,
      missingPrices: first.missingPrices,
      orderBookUnfilled: first.orderBookUnfilled,
      budgetCapacity: null,
      budget: {
        limit: budget.toString(),
        spent: "0",
        unspent: budget.toString(),
        averageUnitCost: null,
        limitingFactor: first.missingPrices.length > 0 ? "unknown-supply" : "market-depth",
        nextUnitShortfall: null,
      },
    };
  }

  const firstCost = BigInt(first.selectedKnownTotal);
  if (request.priceMode === "lowest" && firstCost === 0n) {
    throw new Error("This plan has zero known cost, so a finite budget maximum cannot be calculated.");
  }
  const capacity = maxQuantityWithinBudget(budget, (candidateQuantity) => {
    if (candidateQuantity === 0n) return 0n;
    const candidate = calculate(candidateQuantity);
    return candidate.complete ? BigInt(candidate.selectedKnownTotal) : null;
  });
  if (capacity >= 10n ** 60n) {
    throw new Error("This plan has no finite budget maximum with the available prices.");
  }

  const result = calculate(capacity);
  const spent = BigInt(result.selectedKnownTotal);
  if (spent > budget) throw new Error("The calculated plan exceeds the submitted budget.");
  const next = calculate(capacity + 1n);
  const nextCost = next.complete ? BigInt(next.selectedKnownTotal) : null;
  return {
    ...result,
    budgetCapacity: null,
    budget: {
      limit: budget.toString(),
      spent: spent.toString(),
      unspent: (budget - spent).toString(),
      averageUnitCost: capacity === 0n ? null : (spent / capacity).toString(),
      limitingFactor: next.complete ? "budget" : next.missingPrices.length > 0 ? "unknown-supply" : "market-depth",
      nextUnitShortfall: nextCost !== null && nextCost > budget ? (nextCost - budget).toString() : null,
    },
  };
}

export function shoppingListToCsv(result: CraftResult): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const header = ["Item", "idName", "Quantity", "Unit price", "Lowest cost", "Order-book cost", "Unfilled", "Source"];
  const rows = result.shoppingList.map((line) => [line.name, line.idName, line.quantity, line.unitPrice ?? "", line.lowestCost ?? "", line.orderBookCost ?? "", line.unfilledQuantity, line.priceSource]);
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}
