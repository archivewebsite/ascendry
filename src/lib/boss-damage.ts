import type { CatalogItem } from "@/lib/types";

export const BOSS_RULESET_VERSION = "2026-09-18";
export const DEFAULT_MAX_BOUNTIES = 10_000_000n;
export const DEFAULT_BOUNTY_DAMAGE_FRACTION_BPS = 2_500n;
export const BOUNTY_DAMAGE_UNIT = 1_000_000n;

export const WEAPONS = [
  { idName: "rustyknife", name: "Rusty Knife", damage: 200n },
  { idName: "bomb", name: "Bomb", damage: 20_000n },
  { idName: "broadsword", name: "Broadsword", damage: 311_550n },
  { idName: "poisonspear", name: "Poison Spear", damage: 1_098_000n },
  { idName: "stungun", name: "Stun Gun", damage: 6_658_500n },
  { idName: "knifeturret", name: "Knife Turret", damage: 36_063_000n },
  { idName: "imbuedsword", name: "Imbued Sword", damage: 58_126_950n },
  { idName: "sinurator", name: "Sinurator", damage: 234_600_000n },
  { idName: "crystalsword", name: "Crystal Sword", damage: 999_646_200n },
  { idName: "pocketrocket", name: "Pocket Rocket", damage: 1_355_031_000n },
  { idName: "littlebrother", name: "Little Brother", damage: 15_308_000_000n },
  { idName: "loworbitioncannon", name: "Low Orbit Ion Cannon", damage: 183_396_069_000n },
] as const;

export function weaponsFromCatalog(catalog: CatalogItem[]) {
  const fallback = new Map<string, bigint>(WEAPONS.map((weapon) => [weapon.idName, weapon.damage]));
  return catalog.flatMap((item) => {
    const damage = item.weaponDamage === null || item.weaponDamage === undefined
      ? fallback.get(item.idName)
      : BigInt(item.weaponDamage);
    return damage === undefined || damage <= 0n ? [] : [{ idName: item.idName, name: item.name, damage }];
  });
}

export type BossMode = "max-bounties" | "target-bounties" | "kill-boss";

export function ceilDiv(numerator: bigint, denominator: bigint) {
  if (numerator < 0n || denominator <= 0n) throw new Error("ceilDiv requires a non-negative numerator and positive denominator.");
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

export function effectiveDamage(baseDamage: bigint, multiplierBps: bigint, weakpoint: boolean) {
  if (baseDamage <= 0n || multiplierBps <= 0n) throw new Error("Damage and multiplier must be positive.");
  return baseDamage * multiplierBps * (weakpoint ? 2n : 1n) / 10_000n;
}

export function bountiesForBaseDamage(baseDamage: bigint, maxBounties = DEFAULT_MAX_BOUNTIES, fractionBps = DEFAULT_BOUNTY_DAMAGE_FRACTION_BPS) {
  if (baseDamage <= 0n) return 0n;
  const earned = ceilDiv(baseDamage * fractionBps, 10_000n * BOUNTY_DAMAGE_UNIT);
  return earned > maxBounties ? maxBounties : earned;
}

export function quantityForBounties(weaponDamage: bigint, targetBounties: bigint, maxBounties = DEFAULT_MAX_BOUNTIES, fractionBps = DEFAULT_BOUNTY_DAMAGE_FRACTION_BPS) {
  if (weaponDamage <= 0n || fractionBps <= 0n) throw new Error("Weapon damage and reward fraction must be positive.");
  const target = targetBounties > maxBounties ? maxBounties : targetBounties;
  if (target <= 0n) return 0n;
  const strictThreshold = (target - 1n) * 10_000n * BOUNTY_DAMAGE_UNIT;
  return strictThreshold / (weaponDamage * fractionBps) + 1n;
}

export function calculateWeaponQuantity(input: {
  mode: BossMode;
  weaponDamage: bigint;
  bossHp: bigint;
  targetBounties: bigint;
  maxBounties?: bigint;
  bountyFractionBps?: bigint;
  multiplierBps: bigint;
  weakpoint: boolean;
}) {
  const maxBounties = input.maxBounties ?? DEFAULT_MAX_BOUNTIES;
  const fractionBps = input.bountyFractionBps ?? DEFAULT_BOUNTY_DAMAGE_FRACTION_BPS;
  const perWeaponEffective = effectiveDamage(input.weaponDamage, input.multiplierBps, input.weakpoint);
  const quantity = input.mode === "kill-boss"
    ? ceilDiv(input.bossHp, perWeaponEffective)
    : quantityForBounties(input.weaponDamage, input.mode === "max-bounties" ? maxBounties : input.targetBounties, maxBounties, fractionBps);
  const baseDamage = input.weaponDamage * quantity;
  const totalEffectiveDamage = perWeaponEffective * quantity;
  return {
    quantity,
    baseDamage,
    effectiveDamage: totalEffectiveDamage,
    perWeaponEffective,
    overkill: input.mode === "kill-boss" && totalEffectiveDamage > input.bossHp ? totalEffectiveDamage - input.bossHp : 0n,
    bounties: bountiesForBaseDamage(baseDamage, maxBounties, fractionBps),
  };
}
