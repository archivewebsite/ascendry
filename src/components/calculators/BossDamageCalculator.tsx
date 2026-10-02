"use client";

import { useSearchParams } from "next/navigation";
import { Crosshair, Crown, Sword } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, NativeSelect, Notice } from "@/components/ui";
import { formatInteger } from "@/lib/quantity";
import shared from "@/app/pages.module.css";
import styles from "./Calculators.module.css";

type JsonRecord = Record<string, unknown>;
type Weapon = { idName: string; name: string; damage: string };
type BossResult = { idName: string; name: string; baseDamagePerWeapon: string; effectiveDamagePerWeapon: string; quantity: string; owned: string; acquire: string; baseDamage: string; effectiveDamage: string; overkill: string; bounties: string; cost: string | null; knownCost: string; pricedQuantity: string | null; unpricedQuantity: string | null; complete: boolean; details: unknown };

function record(value: unknown): JsonRecord { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function exact(value: string) { const normalized = value.replaceAll(",", "").trim(); if (!/^\d+$/.test(normalized)) throw new Error("Enter a non-negative whole number."); return normalized; }
async function json<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Request failed."); return body as T; }

export function BossDamageCalculator() {
  const bcId = useSearchParams().get("bcId") ?? "";
  const [mode, setMode] = useState("kill-boss");
  const [weapon, setWeapon] = useState("any");
  const [pricingMode, setPricingMode] = useState("market");
  const [bossHp, setBossHp] = useState("200000000000000");
  const [targetBounties, setTargetBounties] = useState("10000000");
  const [multiplierPercent, setMultiplierPercent] = useState("100");
  const [weakpoint, setWeakpoint] = useState(false);
  const [buddyLevel, setBuddyLevel] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [resultInputKey, setResultInputKey] = useState<string | null>(null);
  const inputKey = JSON.stringify([mode, weapon, pricingMode, bossHp, targetBounties, multiplierPercent, weakpoint, buddyLevel, bcId]);
  const reference = useQuery({ queryKey: ["boss-reference"], queryFn: () => json<{ weapons: Weapon[]; activeBoss: unknown; gameValues: unknown; warning?: string; refreshedAt?: string }>("/api/calculators/boss-damage"), staleTime: Infinity, refetchOnWindowFocus: false });
  const calculation = useMutation({ mutationFn: ({ payload }: { payload: unknown; key: string }) => json<{ results: BossResult[]; best: BossResult; constants: JsonRecord; constantsSource: string }>("/api/calculators/boss-damage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), onSuccess: (_data, variables) => setResultInputKey(variables.key) });

  const activeStatus = record(reference.data?.activeBoss);
  const activeBoss = record(activeStatus.data);
  const activeRemaining = useMemo(() => {
    try { return (BigInt(String(activeBoss.initialHealth ?? "0")) - BigInt(String(activeBoss.damageDealt ?? "0"))).toString(); } catch { return null; }
  }, [activeBoss.initialHealth, activeBoss.damageDealt]);
  useEffect(() => { if (activeRemaining && BigInt(activeRemaining) > 0n) setBossHp(activeRemaining); }, [activeRemaining]);

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const percent = Number(multiplierPercent);
      if (!Number.isFinite(percent) || percent <= 0) throw new Error("Damage multiplier must be greater than zero.");
      const normalizedBossHp = exact(bossHp);
      const normalizedBounties = exact(targetBounties);
      setFormError(null);
      calculation.mutate({ key: inputKey, payload: { mode, weapon, pricingMode, bossHp: normalizedBossHp, targetBounties: normalizedBounties, multiplierBps: String(Math.round(percent * 100)), weakpoint, buddyLevel, bcId: /^\d+$/.test(bcId) ? bcId : undefined } });
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the submitted values."); }
  }
  const currentCalculation = calculation.isSuccess && resultInputKey === inputKey ? calculation.data : null;
  const best = currentCalculation?.best;

  return <div className={shared.stack}>
    <PageHeader title="Boss Damage Calculator" description="Find the exact weapon quantity for rewards or a kill, then rank acquisition plans by total cost." />
    {reference.data?.warning && <Notice>{reference.data.warning}</Notice>}{currentCalculation?.constantsSource === "defaults" && <Notice>Using local default reward constants; live constants could not be loaded.</Notice>}{bcId && <Notice>BcID {bcId} inventory is applied first; cost covers only the additional weapons needed.</Notice>}
    {Object.keys(activeBoss).length > 0 && <Card className={styles.bossBanner}><CardBody><div><span>Last loaded boss status</span><h2>{String(activeBoss.bossId ?? "Unknown boss")}</h2><p>{activeRemaining ? `${formatInteger(activeRemaining)} HP remaining` : "Boss status available"}{reference.data?.refreshedAt ? ` · fetched ${new Date(reference.data.refreshedAt).toLocaleTimeString()}` : ""}</p></div><div className={styles.bossActions}><Button type="button" onClick={() => void reference.refetch()} disabled={reference.isFetching}>{reference.isFetching ? "Refreshing…" : "Refresh status"}</Button><Button type="button" onClick={() => activeRemaining && setBossHp(activeRemaining)} disabled={!activeRemaining}>Use shown HP</Button></div></CardBody></Card>}

    <form onSubmit={submit} className={`${shared.grid} ${shared.twoColumns}`}>
      <Card><CardHeader title="Attack plan" description="Bounties use unmodified base damage; boss kills use effective damage." /><CardBody className={styles.formGrid}>
        <Field label="Mode"><NativeSelect name="boss-mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="kill-boss">Kill the boss</option><option value="max-bounties">Max bounties</option><option value="target-bounties">Target bounties</option></NativeSelect></Field>
        <Field label="Weapon"><NativeSelect name="boss-weapon" value={weapon} onChange={(event) => setWeapon(event.target.value)}><option value="any">Any weapon · lowest total cost</option>{reference.data?.weapons.map((entry) => <option key={entry.idName} value={entry.idName}>{entry.name}</option>)}</NativeSelect></Field>
        <Field label="Pricing mode"><NativeSelect name="boss-pricing-mode" value={pricingMode} onChange={(event) => setPricingMode(event.target.value)}><option value="market">Buy from market</option><option value="direct">Craft using direct recipe</option><option value="recursive">Craft from raw materials</option><option value="base">Base price</option></NativeSelect></Field>
        {mode === "kill-boss" && <Field label="Boss HP remaining" help="Plain whole number"><Input name="boss-hp" inputMode="numeric" value={bossHp} onChange={(event) => setBossHp(event.target.value)} /></Field>}
        {mode === "target-bounties" && <Field label="Target bounties"><Input name="target-bounties" inputMode="numeric" value={targetBounties} onChange={(event) => setTargetBounties(event.target.value)} /></Field>}
        <Field label="Damage multiplier (%)" help="100 means normal damage"><Input name="damage-multiplier" inputMode="decimal" value={multiplierPercent} onChange={(event) => setMultiplierPercent(event.target.value)} /></Field>
        <Field label="Buddy boost level" help="Uses the live per-level multiplier"><Input name="buddy-boost-level" type="number" min={0} max={1000} value={buddyLevel} onChange={(event) => setBuddyLevel(Number(event.target.value))} /></Field>
        <label className={styles.check}><input type="checkbox" checked={weakpoint} onChange={(event) => setWeakpoint(event.target.checked)} /><span><strong>Hit weakpoint</strong><small>Applies the live 2× multiplier to boss damage only.</small></span></label>
        <div className={styles.full}><Button type="submit" variant="primary" disabled={calculation.isPending}><Crosshair aria-hidden="true" />{calculation.isPending ? "Pricing attack…" : "Calculate attack"}</Button></div>
        {(formError || calculation.error) && <div className={styles.full}><ErrorMessage>{formError ?? calculation.error?.message}</ErrorMessage></div>}
      </CardBody></Card>

      <Card><CardHeader title={best && !best.complete ? "Attack requirements" : "Best attack"} description={best && !best.complete ? weapon === "any" ? "No complete price; showing the lowest-overkill weapon as an example." : "Current listings cannot price the full attack." : weapon === "any" ? "Lowest complete total cost; then least overkill and quantity." : "Exact quantity for the selected weapon."} /><CardBody><div aria-live="polite">{!best ? <div className={styles.placeholder}><Sword aria-hidden="true" /><p>{calculation.data && resultInputKey !== inputKey ? "Inputs changed. Calculate again to update the attack plan." : "Select an attack plan to calculate quantity, damage, bounties, inventory use, and acquisition cost."}</p></div> : <>
        <div className={styles.resultLead}><Badge tone={best.complete ? "positive" : "warning"}>{best.complete ? "Complete price" : "Incomplete price"}</Badge><h2>{best.name}</h2></div>
        <div className={styles.metricGrid}><div><span>Weapons required</span><strong>{formatInteger(best.quantity)}</strong></div><div><span>Total acquisition cost</span><strong>{best.cost === null ? "Unavailable" : `${formatInteger(best.cost)} BC`}</strong></div><div><span>Already owned</span><strong>{formatInteger(best.owned)}</strong></div><div><span>Need to acquire</span><strong>{formatInteger(best.acquire)}</strong></div>{!best.complete && <div><span>Known {best.pricedQuantity === null ? "ingredient" : "listing"} subtotal</span><strong>{formatInteger(best.knownCost)} BC</strong></div>}{best.unpricedQuantity !== null && best.unpricedQuantity !== "0" && <div><span>Weapons without listed supply</span><strong>{formatInteger(best.unpricedQuantity)}</strong></div>}</div>
        {!best.complete && <p className={styles.muted}>{best.pricedQuantity === null ? "Some crafting materials lack enough market listings, so the remaining cost is unknown." : `Listings cover ${formatInteger(best.pricedQuantity)} of ${formatInteger(best.acquire)} weapons needed. The known subtotal is not a full purchase price.`}</p>}
        <div className={styles.damageBreakdown}><div><span>Base damage</span><strong>{formatInteger(best.baseDamage)}</strong><small>Determines {formatInteger(best.bounties)} bounties; modifiers excluded.</small></div><div><span>Effective boss damage</span><strong>{formatInteger(best.effectiveDamage)}</strong><small>{formatInteger(best.effectiveDamagePerWeapon)} per weapon after modifiers.</small></div><div><span>Overkill</span><strong>{formatInteger(best.overkill)}</strong><small>Damage beyond entered remaining HP.</small></div></div>
      </>}</div></CardBody></Card>
    </form>

    {currentCalculation && currentCalculation.results.length > 1 && <Card><CardHeader title="Any Weapon ranking" description="Complete costs rank first. Incomplete plans show only known subtotals." /><CardBody><div className={styles.tableScroll}><table className={styles.resultTable}><thead><tr><th>Weapon</th><th>Quantity</th><th>Acquire</th><th>Bounties</th><th>Total cost</th></tr></thead><tbody>{currentCalculation.results.map((entry, index) => <tr key={entry.idName} className={index === 0 && entry.complete ? styles.winner : undefined}><th scope="row">{index === 0 && entry.complete && <Crown aria-hidden="true" weight="fill" />} {entry.name}{!entry.complete && <Badge tone="warning">Partial</Badge>}</th><td>{formatInteger(entry.quantity)}</td><td>{formatInteger(entry.acquire)}</td><td>{formatInteger(entry.bounties)}</td><td>{entry.cost === null ? <>Unavailable<small>Known: {formatInteger(entry.knownCost)} BC</small></> : `${formatInteger(entry.cost)} BC`}</td></tr>)}</tbody></table></div></CardBody></Card>}

    <Card><CardHeader title="Weapon damage reference" description="Exact unmodified base damage used for bounty calculations." /><CardBody><div className={styles.weaponGrid}>{reference.data?.weapons.map((entry) => <article key={entry.idName}><span>{entry.name}</span><strong>{formatInteger(entry.damage)}</strong></article>)}</div><Notice>Live reward constants are read from Bconomy when connected. Damage boosts, Buddy boost, and weakpoints improve boss damage but do not increase base-damage bounty credit.</Notice></CardBody></Card>
  </div>;
}
