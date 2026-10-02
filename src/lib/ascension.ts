export const ASCENSION_RULESET_VERSION = "2026-09-10";

export const RANKS = [
  ["Peasant", 10_000n], ["Bum", 21_920n], ["Commoner", 53_460n], ["Recruit", 106_780n], ["Ensign", 187_920n], ["Soldat", 303_040n],
  ["Captain", 458_440n], ["Admiral", 660_460n], ["Warden", 915_580n], ["Governor", 1_230_320n], ["Viceroy", 1_611_240n], ["Count", 2_065_000n],
  ["Earl", 2_598_320n], ["Magistrate", 3_217_960n], ["Chanticleer", 3_930_700n], ["Colonel", 4_743_400n], ["Commander", 5_662_940n], ["Knight", 6_696_280n],
  ["Overseer", 7_850_380n], ["Aristocrat", 9_132_240n], ["Kingpin", 10_548_920n], ["Agent", 12_107_480n], ["Baron", 13_815_040n], ["Attache", 15_678_740n],
  ["Minister", 17_705_760n], ["Khagan", 19_903_300n], ["Regent", 22_278_560n], ["Taoiseach", 24_838_820n], ["Politarch", 27_591_360n], ["Marquis", 30_543_480n],
  ["Liege", 33_702_500n], ["Sovereign", 37_075_800n], ["Dauphin", 40_670_720n], ["Primor", 44_494_700n], ["Consul", 48_555_120n], ["President", 52_859_460n],
  ["Ruler", 57_415_140n], ["Herald", 62_229_680n], ["Sentinel", 67_310_580n], ["Evincor", 72_665_340n], ["Legate", 78_301_500n], ["Arcanus", 84_226_640n],
  ["Spirit", 90_448_340n], ["Legend", 96_974_180n], ["Harbinger", 103_811_760n], ["Archon", 110_968_740n], ["Enlightened", 118_452_740n], ["Paragon", 126_271_440n],
  ["Quaesitor", 134_432_520n], ["Prophet", 142_943_640n], ["Riftwalker", 151_812_540n], ["Postmortal", 161_046_940n], ["Avatar", 170_654_580n], ["Eternal", 180_643_200n],
  ["Divine", 191_020_600n], ["Deity", 201_794_520n], ["Demigod", 212_972_780n], ["God", 200_000_000n],
] as const satisfies ReadonlyArray<readonly [string, bigint]>;

export interface AscensionPosition { tier: number; rank: number }
export interface AscensionPerks { nepotism: number; anointment: number }
export interface AscensionResult {
  mode: "target" | "max";
  from: AscensionPosition;
  reached: AscensionPosition;
  target: AscensionPosition | null;
  totalCost: string;
  balance: string;
  remaining: string;
  shortfall: string;
  affordable: boolean;
  rulesetVersion: string;
}

function validatePosition(position: AscensionPosition) {
  if (!Number.isInteger(position.tier) || position.tier < 0) throw new Error("Tier must be a non-negative whole number.");
  if (!Number.isInteger(position.rank) || position.rank < 1 || position.rank > RANKS.length) throw new Error(`Rank must be from 1 to ${RANKS.length}.`);
}

function validatePerks(perks: AscensionPerks) {
  if (!Number.isInteger(perks.nepotism) || perks.nepotism < 0 || perks.nepotism > 20) throw new Error("Nepotism must be from 0 to 20.");
  if (!Number.isInteger(perks.anointment) || perks.anointment < 0 || perks.anointment > 20) throw new Error("Anointment must be from 0 to 20.");
}

function discounted(value: bigint, level: number) {
  return value * BigInt(10_000 - level * 250) / 10_000n;
}

export function rankUpCost(tier: number, destinationRank: number, nepotism = 0) {
  validatePosition({ tier, rank: destinationRank });
  if (destinationRank === 1) return 0n;
  return discounted(RANKS[destinationRank - 1]![1] * BigInt(tier + 1), nepotism);
}

export function ascendCost(currentTier: number, anointment = 0) {
  if (!Number.isInteger(currentTier) || currentTier < 0) throw new Error("Tier must be a non-negative whole number.");
  if (currentTier === 0) return 0n;
  return discounted(550_000_000n * BigInt(currentTier + 2), anointment);
}

function rankRangeCost(tier: number, fromRank: number, toRank: number, nepotism: number) {
  let total = 0n;
  for (let destination = fromRank + 1; destination <= toRank; destination += 1) total += rankUpCost(tier, destination, nepotism);
  return total;
}

function compare(left: AscensionPosition, right: AscensionPosition) {
  return left.tier === right.tier ? left.rank - right.rank : left.tier - right.tier;
}

export function calculateAscensionTarget(from: AscensionPosition, target: AscensionPosition, balance: bigint, perks: AscensionPerks): AscensionResult {
  validatePosition(from); validatePosition(target); validatePerks(perks);
  if (balance < 0n) throw new Error("Balance cannot be negative.");
  if (compare(target, from) < 0) throw new Error("Target must not be behind the current tier and rank.");
  let position = { ...from };
  let total = 0n;
  while (position.tier < target.tier) {
    if (position.rank < RANKS.length) {
      const cost = rankRangeCost(position.tier, position.rank, RANKS.length, perks.nepotism);
      total += cost;
    }
    const cost = ascendCost(position.tier, perks.anointment);
    total += cost;
    position = { tier: position.tier + 1, rank: 1 };
  }
  if (position.rank < target.rank) {
    const cost = rankRangeCost(position.tier, position.rank, target.rank, perks.nepotism);
    total += cost;
  }
  const shortfall = total > balance ? total - balance : 0n;
  return { mode: "target", from, reached: target, target, totalCost: total.toString(), balance: balance.toString(), remaining: (balance > total ? balance - total : 0n).toString(), shortfall: shortfall.toString(), affordable: shortfall === 0n, rulesetVersion: ASCENSION_RULESET_VERSION };
}

export function calculateMaxAffordable(from: AscensionPosition, balance: bigint, perks: AscensionPerks, maxTier = 100_000): AscensionResult {
  validatePosition(from); validatePerks(perks);
  if (balance < 0n) throw new Error("Balance cannot be negative.");
  let position = { ...from };
  let remaining = balance;
  let spent = 0n;
  while (position.tier <= maxTier) {
    if (position.rank < RANKS.length) {
      const next = rankUpCost(position.tier, position.rank + 1, perks.nepotism);
      if (next > remaining) break;
      while (position.rank < RANKS.length) {
        const cost = rankUpCost(position.tier, position.rank + 1, perks.nepotism);
        if (cost > remaining) break;
        remaining -= cost; spent += cost; position.rank += 1;
      }
      if (position.rank < RANKS.length) break;
    }
    if (position.tier === maxTier) break;
    const cost = ascendCost(position.tier, perks.anointment);
    if (cost > remaining) break;
    remaining -= cost; spent += cost;
    position = { tier: position.tier + 1, rank: 1 };
  }
  return { mode: "max", from, reached: position, target: null, totalCost: spent.toString(), balance: balance.toString(), remaining: remaining.toString(), shortfall: "0", affordable: true, rulesetVersion: ASCENSION_RULESET_VERSION };
}
