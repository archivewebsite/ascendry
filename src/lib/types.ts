export type DecimalString = string;

export interface RecipeIngredient {
  ingredientIdName: string;
  ingredientName: string;
  amount: DecimalString;
}

export interface CatalogItem {
  id: number;
  idName: string;
  name: string;
  emoji: string;
  imageUrl: string | null;
  description: string | null;
  baseValue: DecimalString;
  weaponDamage?: DecimalString | null;
  craftable: boolean;
  attributes: string[];
  lootSources: string[];
  recipe: RecipeIngredient[];
  usedToCraft: string[];
  market: MarketPrice | null;
  mercantilistLevel: number | null;
}

export interface MarketPrice {
  price: DecimalString | null;
  delta: { day: number | null; week: number | null; month: number | null };
  snapshotAt: string;
  source: "live" | "local";
}

export interface MarketListing {
  id: DecimalString;
  bcId: DecimalString;
  itemId: number;
  price: DecimalString;
  amount: DecimalString;
}

export type RecipeMode = "direct" | "recursive" | "optimized";
export type PriceMode = "lowest" | "orderbook";
export type CraftTargetMode = "quantity" | "budget";

export interface PrestigeProfileSnapshot {
  id?: string;
  name: string;
  levels: Record<string, number>;
  capturedAt?: string;
}

export interface CraftRequest {
  idName: string;
  quantity: DecimalString;
  targetMode?: CraftTargetMode;
  recipeMode: RecipeMode;
  priceMode: PriceMode;
  profile: PrestigeProfileSnapshot;
  manualPriceOverrides: Record<string, DecimalString>;
  salePrice?: DecimalString;
  budget?: DecimalString;
  orderBooks?: Record<string, MarketListing[]>;
}

export type CraftRecommendation = "buy" | "craft" | "mix" | "unavailable";

export interface CraftDecision {
  idName: string;
  name: string;
  requiredQuantity: DecimalString;
  buyQuantity: DecimalString;
  craftQuantity: DecimalString;
  unfilledQuantity: DecimalString;
  buyCost: DecimalString;
  priceSource: "market" | "override" | "missing";
}

export interface CraftComparison {
  knownCost: DecimalString;
  complete: boolean;
  fulfilledQuantity: DecimalString;
  unfilledQuantity: DecimalString;
}

export interface CraftTreeNode {
  idName: string;
  name: string;
  quantity: DecimalString;
  action: "craft" | "buy" | "mix" | "raw";
  unitPrice: DecimalString | null;
  subtotal: DecimalString | null;
  priceSource: "market" | "override" | "missing";
  buyQuantity?: DecimalString;
  craftQuantity?: DecimalString;
  unfilledQuantity?: DecimalString;
  children: CraftTreeNode[];
}

export interface ShoppingLine {
  idName: string;
  name: string;
  quantity: DecimalString;
  unitPrice: DecimalString | null;
  lowestCost: DecimalString | null;
  orderBookCost: DecimalString | null;
  filledQuantity: DecimalString;
  unfilledQuantity: DecimalString;
  priceSource: "market" | "override" | "missing";
  decision: "buy" | "raw";
  percentOfKnownCost: number;
}

export interface ProfitabilityResult {
  feeBps: number;
  gross: DecimalString | null;
  fee: DecimalString | null;
  net: DecimalString | null;
  materialCost: DecimalString | null;
  profit: DecimalString | null;
  marginPercent: number | null;
  roiPercent: number | null;
  breakEvenListingPrice: DecimalString | null;
  requiredMercantilistLevel: number | null;
  eligibleToSell: boolean | null;
  hypothetical: boolean;
}

export interface CraftResult {
  target: { idName: string; name: string; quantity: DecimalString };
  recipeMode: RecipeMode;
  priceMode: PriceMode;
  marketSnapshotAt: string | null;
  tree: CraftTreeNode;
  shoppingList: ShoppingLine[];
  knownLowestTotal: DecimalString;
  knownOrderBookTotal: DecimalString;
  selectedKnownTotal: DecimalString;
  complete: boolean;
  custom: boolean;
  missingPrices: string[];
  orderBookUnfilled: Record<string, DecimalString>;
  budgetCapacity: { lowest: DecimalString | null; orderBook: DecimalString | null } | null;
  budget?: {
    limit: DecimalString;
    spent: DecimalString;
    unspent: DecimalString;
    averageUnitCost: DecimalString | null;
    limitingFactor: "budget" | "market-depth" | "unknown-supply";
    nextUnitShortfall: DecimalString | null;
  };
  profitability: ProfitabilityResult;
  recommendation?: CraftRecommendation;
  recommendationSummary?: string;
  fulfilledQuantity?: DecimalString;
  unfilledQuantity?: DecimalString;
  decisions?: CraftDecision[];
  comparisons?: {
    directBuy: CraftComparison;
    craftAll: CraftComparison;
    optimized: CraftComparison;
  };
  savingsVsBuy?: DecimalString | null;
  savingsVsCraft?: DecimalString | null;
}

export interface SavedPlan {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  payload: CraftRequest & { profile: PrestigeProfileSnapshot; marketSnapshotAt: string | null };
  result: CraftResult;
}

export interface WatchAlert {
  id: string;
  idName: string;
  itemName?: string;
  direction: "below" | "above";
  threshold: DecimalString;
  enabled: boolean;
  triggeredAt: string | null;
  triggeredPrice: DecimalString | null;
  createdAt: string;
}
