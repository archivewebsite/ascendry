import "server-only";

import loadHighs from "highs";
import { init, killThreads, type Arith } from "z3-solver";
import { fillOrderBook } from "@/lib/market-math";
import type { CatalogItem, CraftDecision, CraftRequest, MarketListing } from "@/lib/types";

type OptimizerStrategy = "lowest-cost" | "craft-all";

export interface ProductionPlan {
  fulfilledQuantity: string;
  unfilledQuantity: string;
  knownCost: string;
  complete: boolean;
  decisions: CraftDecision[];
}

let runtimePromise: ReturnType<typeof init> | null = null;
let highsPromise: ReturnType<typeof loadHighs> | null = null;

function runtime() {
  runtimePromise ??= init();
  return runtimePromise;
}

function highsRuntime() {
  highsPromise ??= loadHighs();
  return highsPromise;
}

export async function closeCraftingOptimizerForTests() {
  if (runtimePromise) {
    const active = await runtimePromise;
    await killThreads(active.em);
  }
  runtimePromise = null;
  highsPromise = null;
}

export function reachableCatalogItems(idName: string, catalog: CatalogItem[]): CatalogItem[] {
  const byName = new Map(catalog.map((item) => [item.idName, item]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: CatalogItem[] = [];

  function visit(currentId: string) {
    if (visiting.has(currentId)) {
      const item = byName.get(currentId);
      throw new Error(`Crafting cycle detected at ${item?.name ?? currentId}.`);
    }
    if (visited.has(currentId)) return;
    const item = byName.get(currentId);
    if (!item) throw new Error(`Recipe references an unknown item: ${currentId}.`);
    visiting.add(currentId);
    result.push(item);
    for (const ingredient of item.recipe) {
      if (!byName.has(ingredient.ingredientIdName)) {
        throw new Error(`Recipe for ${item.name} references an unknown item: ${ingredient.ingredientIdName}.`);
      }
      visit(ingredient.ingredientIdName);
    }
    visiting.delete(currentId);
    visited.add(currentId);
  }

  visit(idName);
  return result;
}

function normalizedListings(listings: MarketListing[] | undefined): MarketListing[] {
  return (listings ?? [])
    .filter((listing) => BigInt(listing.amount) > 0n && BigInt(listing.price) >= 0n)
    .sort((left, right) => {
      const price = BigInt(left.price) - BigInt(right.price);
      if (price !== 0n) return price < 0n ? -1 : 1;
      return left.id.localeCompare(right.id);
    });
}

function maximumDemands(target: CatalogItem, quantity: bigint, items: Map<string, CatalogItem>): Map<string, bigint> {
  const demands = new Map<string, bigint>();
  function expand(item: CatalogItem, required: bigint) {
    demands.set(item.idName, (demands.get(item.idName) ?? 0n) + required);
    if (!item.craftable) return;
    for (const ingredient of item.recipe) {
      const child = items.get(ingredient.ingredientIdName);
      if (!child) throw new Error(`Recipe for ${item.name} references an unknown item: ${ingredient.ingredientIdName}.`);
      expand(child, required * BigInt(ingredient.amount));
    }
  }
  expand(target, quantity);
  return demands;
}

export async function optimizeOrderBookPlan(
  request: CraftRequest,
  catalog: CatalogItem[],
  strategy: OptimizerStrategy = "lowest-cost",
  budget?: bigint,
): Promise<ProductionPlan> {
  if (canUseFastSolver(request, catalog, budget)) {
    try {
      const plan = await optimizeOrderBookPlanWithHighs(request, catalog, strategy, budget);
      if (budget !== undefined && BigInt(plan.knownCost) > budget) throw new Error("Fast plan exceeded the exact budget.");
      return plan;
    } catch {
      // Exact arbitrary-precision fallback below also handles any numerical rejection.
    }
  }
  return optimizeOrderBookPlanWithZ3(request, catalog, strategy, budget);
}

interface FastVariable {
  name: string;
  itemId: string;
  kind: "buy" | "craft";
  upper: bigint;
  price: bigint;
  source: CraftDecision["priceSource"];
}

interface FastModel {
  text: string;
  variables: FastVariable[];
  fulfilledVariable: string | null;
}

const FAST_INTEGER_LIMIT = BigInt(Number.MAX_SAFE_INTEGER);

function canUseFastSolver(request: CraftRequest, catalog: CatalogItem[], budget?: bigint): boolean {
  const values: bigint[] = [BigInt(request.quantity)];
  if (budget !== undefined) values.push(budget);
  for (const value of Object.values(request.manualPriceOverrides)) values.push(BigInt(value));
  for (const listings of Object.values(request.orderBooks ?? {})) {
    for (const listing of listings) values.push(BigInt(listing.amount), BigInt(listing.price));
  }
  for (const item of catalog) for (const ingredient of item.recipe) values.push(BigInt(ingredient.amount));
  if (!values.every((value) => value >= 0n && value <= FAST_INTEGER_LIMIT)) return false;

  // HiGHS uses doubles. Exact input coefficients are insufficient when their
  // products or sums exceed the last consecutively representable integer.
  const reachable = reachableCatalogItems(request.idName, catalog);
  const target = reachable.find((item) => item.idName === request.idName);
  if (!target) return false;
  const caps = maximumDemands(target, BigInt(request.quantity), new Map(reachable.map((item) => [item.idName, item])));
  let largestPossibleCost = 0n;
  for (const item of reachable) {
    const cap = caps.get(item.idName) ?? 0n;
    if (cap > FAST_INTEGER_LIMIT) return false;
    const override = request.manualPriceOverrides[item.idName];
    const prices = override === undefined
      ? (request.orderBooks?.[item.idName] ?? []).map((listing) => BigInt(listing.price))
      : [BigInt(override)];
    const highestPrice = prices.reduce((highest, price) => price > highest ? price : highest, 0n);
    largestPossibleCost += cap * highestPrice;
    if (largestPossibleCost > FAST_INTEGER_LIMIT) return false;
  }
  return true;
}

function linearExpression(terms: Array<{ coefficient: bigint; variable: string }>): string {
  const nonzero = terms.filter((term) => term.coefficient !== 0n);
  if (nonzero.length === 0) return "0 zero_anchor";
  return nonzero.map((term, index) => {
    const negative = term.coefficient < 0n;
    const absolute = negative ? -term.coefficient : term.coefficient;
    const coefficient = absolute === 1n ? "" : `${absolute.toString()} `;
    const sign = index === 0 ? (negative ? "- " : "") : negative ? " - " : " + ";
    return `${sign}${coefficient}${term.variable}`;
  }).join("");
}

function createFastModel(
  request: CraftRequest,
  reachable: CatalogItem[],
  target: CatalogItem,
  demandCaps: Map<string, bigint>,
  strategy: OptimizerStrategy,
  mode: "minimize" | "maximize",
  fulfilledTarget: bigint | null,
  budget?: bigint,
): FastModel {
  const overrides = new Map(Object.entries(request.manualPriceOverrides).map(([id, value]) => [id, BigInt(value)]));
  const variables: FastVariable[] = [];
  const craftNames = new Map<string, string>();
  const buyNames = new Map<string, string[]>();

  reachable.forEach((item, itemIndex) => {
    const cap = demandCaps.get(item.idName) ?? 0n;
    if (item.craftable && item.recipe.length > 0) {
      const name = `craft_${itemIndex}`;
      craftNames.set(item.idName, name);
      variables.push({ name, itemId: item.idName, kind: "craft", upper: cap, price: 0n, source: "market" });
    }
    const names: string[] = [];
    if (!(strategy === "craft-all" && craftNames.has(item.idName))) {
      const override = overrides.get(item.idName);
      if (override !== undefined) {
        const name = `buy_${itemIndex}_custom`;
        variables.push({ name, itemId: item.idName, kind: "buy", upper: cap, price: override, source: "override" });
        names.push(name);
      } else {
        let remaining = cap;
        normalizedListings(request.orderBooks?.[item.idName]).forEach((listing, listingIndex) => {
          if (remaining === 0n) return;
          const upper = minBigInt(BigInt(listing.amount), remaining);
          const name = `buy_${itemIndex}_${listingIndex}`;
          variables.push({ name, itemId: item.idName, kind: "buy", upper, price: BigInt(listing.price), source: "market" });
          names.push(name);
          remaining -= upper;
        });
      }
    }
    buyNames.set(item.idName, names);
  });

  const costTerms = variables.filter((variable) => variable.kind === "buy").map((variable) => ({ coefficient: variable.price, variable: variable.name }));
  const fulfilledVariable = mode === "maximize" ? "fulfilled_output" : null;
  const lines = [mode === "maximize" ? "Maximize" : "Minimize", ` obj: ${mode === "maximize" ? fulfilledVariable : linearExpression(costTerms)}`, "Subject To"];

  reachable.forEach((item, itemIndex) => {
    const terms: Array<{ coefficient: bigint; variable: string }> = [];
    for (const name of buyNames.get(item.idName) ?? []) terms.push({ coefficient: 1n, variable: name });
    const craft = craftNames.get(item.idName);
    if (craft) terms.push({ coefficient: 1n, variable: craft });
    for (const parent of reachable) {
      const parentCraft = craftNames.get(parent.idName);
      if (!parentCraft) continue;
      for (const ingredient of parent.recipe) {
        if (ingredient.ingredientIdName === item.idName) terms.push({ coefficient: -BigInt(ingredient.amount), variable: parentCraft });
      }
    }
    if (item.idName === target.idName && fulfilledVariable) terms.push({ coefficient: -1n, variable: fulfilledVariable });
    const right = item.idName === target.idName && !fulfilledVariable ? (fulfilledTarget ?? 0n) : 0n;
    lines.push(` balance_${itemIndex}: ${linearExpression(terms)} = ${right.toString()}`);
  });
  if (budget !== undefined) lines.push(` budget: ${linearExpression(costTerms)} <= ${budget.toString()}`);

  lines.push("Bounds", " zero_anchor = 0");
  for (const variable of variables) lines.push(` 0 <= ${variable.name} <= ${variable.upper.toString()}`);
  if (fulfilledVariable) lines.push(` 0 <= ${fulfilledVariable} <= ${request.quantity}`);
  lines.push("Generals", ` zero_anchor ${variables.map((variable) => variable.name).join(" ")}${fulfilledVariable ? ` ${fulfilledVariable}` : ""}`, "End");
  return { text: lines.join("\n"), variables, fulfilledVariable };
}

function integerColumn(solution: { Columns: Record<string, { Primal?: number }> }, name: string): bigint {
  const raw = solution.Columns[name]?.Primal ?? 0;
  const rounded = Math.round(raw);
  if (!Number.isSafeInteger(rounded) || Math.abs(raw - rounded) > 0.00001) throw new Error(`The optimized quantity for ${name} was not an exact integer.`);
  return BigInt(rounded);
}

function fastPlanFromSolution(
  solution: { Columns: Record<string, { Primal?: number }> },
  model: FastModel,
  request: CraftRequest,
  reachable: CatalogItem[],
  target: CatalogItem,
  fulfilled: bigint,
): ProductionPlan {
  const bought = new Map<string, bigint>();
  const crafted = new Map<string, bigint>();
  const costs = new Map<string, bigint>();
  const sources = new Map<string, CraftDecision["priceSource"]>();
  for (const variable of model.variables) {
    const value = integerColumn(solution, variable.name);
    if (value < 0n || value > variable.upper) throw new Error(`The optimized quantity for ${variable.name} is outside its exact bounds.`);
    if (variable.kind === "craft") crafted.set(variable.itemId, value);
    else {
      bought.set(variable.itemId, (bought.get(variable.itemId) ?? 0n) + value);
      costs.set(variable.itemId, (costs.get(variable.itemId) ?? 0n) + value * variable.price);
      if (value > 0n) sources.set(variable.itemId, variable.source);
    }
  }

  let knownCost = 0n;
  const decisions: CraftDecision[] = [];
  for (const item of reachable) {
    const buyQuantity = bought.get(item.idName) ?? 0n;
    const craftQuantity = crafted.get(item.idName) ?? 0n;
    let exactDemand = item.idName === target.idName ? fulfilled : 0n;
    for (const parent of reachable) {
      const parentCraft = crafted.get(parent.idName) ?? 0n;
      for (const ingredient of parent.recipe) if (ingredient.ingredientIdName === item.idName) exactDemand += parentCraft * BigInt(ingredient.amount);
    }
    if (buyQuantity + craftQuantity !== exactDemand) throw new Error(`The optimized recipe balance for ${item.name} could not be verified exactly.`);
    const buyCost = costs.get(item.idName) ?? 0n;
    knownCost += buyCost;
    decisions.push({
      idName: item.idName,
      name: item.name,
      requiredQuantity: (item.idName === target.idName ? BigInt(request.quantity) : exactDemand).toString(),
      buyQuantity: buyQuantity.toString(),
      craftQuantity: craftQuantity.toString(),
      unfilledQuantity: (item.idName === target.idName ? BigInt(request.quantity) - fulfilled : 0n).toString(),
      buyCost: buyCost.toString(),
      priceSource: sources.get(item.idName) ?? (request.manualPriceOverrides[item.idName] !== undefined ? "override" : "missing"),
    });
  }
  return {
    fulfilledQuantity: fulfilled.toString(),
    unfilledQuantity: (BigInt(request.quantity) - fulfilled).toString(),
    knownCost: knownCost.toString(),
    complete: fulfilled === BigInt(request.quantity),
    decisions,
  };
}

async function optimizeOrderBookPlanWithHighs(
  request: CraftRequest,
  catalog: CatalogItem[],
  strategy: OptimizerStrategy,
  budget?: bigint,
): Promise<ProductionPlan> {
  const requested = BigInt(request.quantity);
  if (requested <= 0n) throw new Error("Quantity must be positive.");
  const reachable = reachableCatalogItems(request.idName, catalog);
  const byName = new Map(reachable.map((item) => [item.idName, item]));
  const target = byName.get(request.idName);
  if (!target) throw new Error("The selected item is not in the catalog.");
  const demandCaps = maximumDemands(target, requested, byName);
  const highs = await highsRuntime();
  const options = { output_flag: false, mip_rel_gap: 0, mip_abs_gap: 0, mip_feasibility_tolerance: 1e-9 } as const;

  if (budget !== undefined) {
    const capacityModel = createFastModel(request, reachable, target, demandCaps, strategy, "maximize", null, budget);
    const capacitySolution = highs.solve(capacityModel.text, options);
    if (capacitySolution.Status !== "Optimal") throw new Error(`Fast budget optimization ended with ${capacitySolution.Status}.`);
    const fulfilled = integerColumn(capacitySolution, capacityModel.fulfilledVariable!);
    const costModel = createFastModel(request, reachable, target, demandCaps, strategy, "minimize", fulfilled, budget);
    const costSolution = highs.solve(costModel.text, options);
    if (costSolution.Status !== "Optimal") throw new Error(`Fast budget cost optimization ended with ${costSolution.Status}.`);
    return fastPlanFromSolution(costSolution, costModel, request, reachable, target, fulfilled);
  }

  let fulfilled = requested;
  let model = createFastModel(request, reachable, target, demandCaps, strategy, "minimize", fulfilled);
  let solution = highs.solve(model.text, options);
  if (solution.Status === "Infeasible") {
    const capacityModel = createFastModel(request, reachable, target, demandCaps, strategy, "maximize", null);
    const capacitySolution = highs.solve(capacityModel.text, options);
    if (capacitySolution.Status !== "Optimal") throw new Error(`Fast fulfilment optimization ended with ${capacitySolution.Status}.`);
    fulfilled = integerColumn(capacitySolution, capacityModel.fulfilledVariable!);
    model = createFastModel(request, reachable, target, demandCaps, strategy, "minimize", fulfilled);
    solution = highs.solve(model.text, options);
  }
  if (solution.Status !== "Optimal") throw new Error(`Fast cost optimization ended with ${solution.Status}.`);
  return fastPlanFromSolution(solution, model, request, reachable, target, fulfilled);
}

async function optimizeOrderBookPlanWithZ3(
  request: CraftRequest,
  catalog: CatalogItem[],
  strategy: OptimizerStrategy = "lowest-cost",
  budget?: bigint,
): Promise<ProductionPlan> {
  const requested = BigInt(request.quantity);
  if (requested <= 0n) throw new Error("Quantity must be positive.");

  const reachable = reachableCatalogItems(request.idName, catalog);
  const byName = new Map(reachable.map((item) => [item.idName, item]));
  const target = byName.get(request.idName);
  if (!target) throw new Error("The selected item is not in the catalog.");
  const demandCaps = maximumDemands(target, requested, byName);
  const overrides = new Map(Object.entries(request.manualPriceOverrides).map(([id, value]) => [id, BigInt(value)]));
  const z3 = await runtime();
  const { Context } = z3;
  const context = new Context("ascendry_optimizer");
  const { Int, Optimize } = context;
  const optimizer = new Optimize();
  optimizer.set("priority", "lex");

  const zero = Int.val(0);
  const craftVariables = new Map<string, Arith<"ascendry_optimizer">>();
  const buyExpressions = new Map<string, Arith<"ascendry_optimizer">>();
  let totalCost: Arith<"ascendry_optimizer"> = zero;

  try {
    reachable.forEach((item, itemIndex) => {
      if (item.craftable && item.recipe.length > 0) {
        const variable = Int.const(`craft_${itemIndex}`);
        optimizer.add(variable.ge(0), variable.le(Int.val(demandCaps.get(item.idName) ?? 0n)));
        craftVariables.set(item.idName, variable);
      }

      const variables: Array<{ variable: Arith<"ascendry_optimizer">; price: bigint }> = [];
      const override = overrides.get(item.idName);
      if (override !== undefined) {
        if (override < 0n) throw new Error(`Manual price for ${item.name} cannot be negative.`);
        const variable = Int.const(`buy_${itemIndex}_custom`);
        optimizer.add(variable.ge(0), variable.le(Int.val(demandCaps.get(item.idName) ?? 0n)));
        variables.push({ variable, price: override });
      } else {
        let remainingDemand = demandCaps.get(item.idName) ?? 0n;
        normalizedListings(request.orderBooks?.[item.idName]).forEach((listing, listingIndex) => {
          if (remainingDemand === 0n) return;
          const capacity = minBigInt(BigInt(listing.amount), remainingDemand);
          const variable = Int.const(`buy_${itemIndex}_${listingIndex}`);
          optimizer.add(variable.ge(0), variable.le(Int.val(capacity)));
          variables.push({ variable, price: BigInt(listing.price) });
          remainingDemand -= capacity;
        });
      }

      let bought: Arith<"ascendry_optimizer"> = zero;
      for (const entry of variables) {
        bought = bought.add(entry.variable);
        totalCost = totalCost.add(entry.variable.mul(entry.price));
      }
      buyExpressions.set(item.idName, bought);
      if (strategy === "craft-all" && craftVariables.has(item.idName)) optimizer.add(bought.eq(0));
    });

    const fulfilled = Int.const("fulfilled_output");
    optimizer.add(fulfilled.ge(0), fulfilled.le(Int.val(requested)));

    for (const item of reachable) {
      let supply: Arith<"ascendry_optimizer"> = buyExpressions.get(item.idName) ?? zero;
      const crafted = craftVariables.get(item.idName);
      if (crafted) supply = supply.add(crafted);

      let demand: Arith<"ascendry_optimizer"> = item.idName === target.idName ? fulfilled : zero;
      for (const parent of reachable) {
        const parentCraft = craftVariables.get(parent.idName);
        if (!parentCraft) continue;
        for (const ingredient of parent.recipe) {
          if (ingredient.ingredientIdName === item.idName) {
            demand = demand.add(parentCraft.mul(BigInt(ingredient.amount)));
          }
        }
      }
      optimizer.add(supply.eq(demand));
    }

    if (budget !== undefined) {
      if (budget < 0n) throw new Error("Budget cannot be negative.");
      optimizer.add(totalCost.le(Int.val(budget)));
    }
    optimizer.maximize(fulfilled);
    optimizer.minimize(totalCost);
    const status = await optimizer.check();
    if (status !== "sat") throw new Error(`The lowest-cost plan could not be solved (${status}).`);

    const model = optimizer.model();
    const valueOf = (expression: Arith<"ascendry_optimizer">) => BigInt(model.eval(expression, true).toString());
    const fulfilledQuantity = valueOf(fulfilled);
    const modelCost = valueOf(totalCost);
    const decisions: CraftDecision[] = [];
    let recomputedCost = 0n;

    for (const item of reachable) {
      const buyQuantity = valueOf(buyExpressions.get(item.idName) ?? zero);
      const craftQuantity = craftVariables.has(item.idName) ? valueOf(craftVariables.get(item.idName)!) : 0n;
      const requiredQuantity = buyQuantity + craftQuantity;
      const override = overrides.get(item.idName);
      let buyCost = 0n;
      let priceSource: CraftDecision["priceSource"] = "missing";
      if (buyQuantity > 0n && override !== undefined) {
        buyCost = buyQuantity * override;
        priceSource = "override";
      } else if (buyQuantity > 0n) {
        const fill = fillOrderBook(buyQuantity, normalizedListings(request.orderBooks?.[item.idName]));
        if (fill.unfilled !== 0n) throw new Error(`The optimized plan exceeds the known listings for ${item.name}.`);
        buyCost = fill.knownCost;
        priceSource = "market";
      } else if (override !== undefined) {
        priceSource = "override";
      } else if ((request.orderBooks?.[item.idName]?.length ?? 0) > 0) {
        priceSource = "market";
      }
      recomputedCost += buyCost;
      decisions.push({
        idName: item.idName,
        name: item.name,
        requiredQuantity: (item.idName === target.idName ? requested : requiredQuantity).toString(),
        buyQuantity: buyQuantity.toString(),
        craftQuantity: craftQuantity.toString(),
        unfilledQuantity: (item.idName === target.idName ? requested - fulfilledQuantity : 0n).toString(),
        buyCost: buyCost.toString(),
        priceSource,
      });
    }

    if (recomputedCost !== modelCost) throw new Error("The optimized market cost could not be verified exactly.");
    return {
      fulfilledQuantity: fulfilledQuantity.toString(),
      unfilledQuantity: (requested - fulfilledQuantity).toString(),
      knownCost: modelCost.toString(),
      complete: fulfilledQuantity === requested,
      decisions,
    };
  } finally {
    optimizer.release();
  }
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}
