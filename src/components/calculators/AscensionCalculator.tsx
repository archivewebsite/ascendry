"use client";

import { useSearchParams } from "next/navigation";
import { ArrowFatLinesUp, CheckCircle, CurrencyCircleDollar, Sparkle } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, NativeSelect, Notice } from "@/components/ui";
import { RANKS, type AscensionResult } from "@/lib/ascension";
import { marketFeeBps } from "@/lib/market-math";
import { formatInteger } from "@/lib/quantity";
import type { CatalogItem } from "@/lib/types";
import shared from "@/app/pages.module.css";
import styles from "./Calculators.module.css";

type JsonRecord = Record<string, unknown>;
type SaleStrategy = { id: "quick" | "balanced" | "patient"; label: string; price: bigint; net: bigint; confidence: string; note: string };

function record(value: unknown): JsonRecord { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function exact(value: string) { const normalized = value.replaceAll(",", "").trim(); if (!/^\d+$/.test(normalized)) throw new Error("Enter a non-negative whole BC amount."); return normalized; }
function toBigInt(value: unknown): bigint | null { try { return value === null || value === undefined ? null : BigInt(String(value)); } catch { return null; } }
function median(values: bigint[]) { if (!values.length) return null; const sorted = [...values].sort((a,b) => a < b ? -1 : a > b ? 1 : 0); return sorted[(sorted.length - 1) / 2 | 0]!; }
function percentile(values: bigint[], ratio: number) { if (!values.length) return null; const sorted = [...values].sort((a,b) => a < b ? -1 : a > b ? 1 : 0); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]!; }
async function json<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Request failed."); return body as T; }

export function AscensionCalculator() {
  const bcId = useSearchParams().get("bcId") ?? "";
  const prefilled = useRef(false);
  const [mode, setMode] = useState<"target" | "max">("target");
  const [currentTier, setCurrentTier] = useState(0);
  const [currentRank, setCurrentRank] = useState(1);
  const [targetTier, setTargetTier] = useState(1);
  const [targetRank, setTargetRank] = useState(1);
  const [balance, setBalance] = useState("0");
  const [nepotism, setNepotism] = useState(0);
  const [anointment, setAnointment] = useState(0);
  const [itemText, setItemText] = useState("");
  const [amount, setAmount] = useState("1");
  const [insider, setInsider] = useState(0);
  const [mercantilist, setMercantilist] = useState(0);
  const [marketItem, setMarketItem] = useState<CatalogItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [resultInputKey, setResultInputKey] = useState<string | null>(null);
  const inputKey = JSON.stringify([mode, currentTier, currentRank, targetTier, targetRank, balance, nepotism, anointment]);

  const player = useQuery({ queryKey: ["player", bcId, "overview"], queryFn: () => json<JsonRecord>(`/api/players/${bcId}/overview`), enabled: /^\d+$/.test(bcId), staleTime: Infinity, refetchOnWindowFocus: false, refetchOnMount: false });
  const catalog = useQuery({ queryKey: ["items", "ascension-runway"], queryFn: () => json<{ items: CatalogItem[] }>("/api/items"), staleTime: 60_000 });
  useEffect(() => {
    if (!player.data || prefilled.current) return;
    const user = record(player.data.user); const perks = record(user.perks);
    setCurrentTier(Number(user.tier ?? 0)); setCurrentRank(Number(user.rank ?? 1)); setTargetTier(Number(user.tier ?? 0) + 1); setBalance(String(user.bc ?? "0"));
    setNepotism(Number(perks.nepotism ?? 0)); setAnointment(Number(perks.anointment ?? 0)); setInsider(Number(perks.insider ?? 0)); setMercantilist(Number(perks.mercantilist ?? 0));
    prefilled.current = true;
  }, [player.data]);

  const calculation = useMutation({ mutationFn: ({ payload }: { payload: unknown; key: string }) => json<{ result: AscensionResult }>("/api/calculators/ascension", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), onSuccess: (_data, variables) => setResultInputKey(variables.key) });
  const result = calculation.isSuccess && resultInputKey === inputKey ? calculation.data?.result : undefined;
  const market = useQuery({ queryKey: ["ascension-runway", marketItem?.idName], queryFn: () => json<JsonRecord>(`/api/items/${marketItem!.idName}/market?days=90`), enabled: Boolean(marketItem), staleTime: 60_000, refetchOnWindowFocus: true });
  const selectedItem = catalog.data?.items.find((item) => item.name.toLowerCase() === itemText.toLowerCase() || item.idName.toLowerCase() === itemText.toLowerCase());
  const marketMatchesInput = selectedItem?.idName === marketItem?.idName;

  function calculate(event: FormEvent) {
    event.preventDefault();
    try {
      const normalizedBalance = exact(balance);
      setFormError(null);
      calculation.mutate({ key: inputKey, payload: { mode, current: { tier: currentTier, rank: currentRank }, target: { tier: targetTier, rank: targetRank }, balance: normalizedBalance, perks: { nepotism, anointment } } });
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the submitted values."); }
  }

  function analyzeMarket() {
    const item = catalog.data?.items.find((candidate) => candidate.idName.toLowerCase() === itemText.toLowerCase() || candidate.name.toLowerCase() === itemText.toLowerCase());
    try {
      exact(amount);
      if (!item) throw new Error("Choose an item from the search suggestions.");
      if (!result) throw new Error("Calculate an ascension target first.");
      setFormError(null);
      if (item.idName === marketItem?.idName) void market.refetch();
      else setMarketItem(item);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the sale inputs."); }
  }

  const strategies = useMemo((): SaleStrategy[] => {
    if (!market.data || !marketItem || market.isFetching || market.error) return [];
    const listings = Array.isArray(market.data.listings) ? market.data.listings.map(record) : [];
    const transactions = Array.isArray(market.data.transactions) ? market.data.transactions.map(record) : [];
    const histories = Array.isArray(market.data.priceHistory) ? market.data.priceHistory.map(record) : [];
    const volumes = Array.isArray(market.data.volumeHistory) ? market.data.volumeHistory.map(record) : [];
    const asks = listings.map((entry) => toBigInt(entry.price)).filter((value): value is bigint => value !== null && value > 0n);
    const buys = transactions.filter((entry) => entry.type === "buy").map((entry) => toBigInt(entry.price)).filter((value): value is bigint => value !== null && value > 0n);
    const history = histories.map((entry) => toBigInt(entry.lowestPrice)).filter((value): value is bigint => value !== null && value > 0n);
    const vwapRevenue = volumes.reduce((sum, entry) => sum + (toBigInt(entry.totalRevenue) ?? 0n), 0n);
    const vwapUnits = volumes.reduce((sum, entry) => sum + (toBigInt(entry.unitsSold) ?? 0n), 0n);
    const vwap = vwapUnits > 0n ? vwapRevenue / vwapUnits : null;
    const lowest = asks.length ? asks.reduce((best, value) => value < best ? value : best) : null;
    const recent = median(buys); const historyMedian = median(history);
    const available = [lowest, recent, historyMedian, vwap].filter((value): value is bigint => value !== null);
    if (available.length === 0) return [];
    const quick = lowest ? (lowest > 1n ? lowest - 1n : lowest) : recent;
    const balanced = median(available)!;
    const patient = [percentile(history, .75), percentile(buys, .75), balanced].filter((value): value is bigint => value !== null).reduce((best, value) => value > best ? value : best, balanced);
    const normalizedAmount = amount.replaceAll(",", "").trim();
    if (!/^\d+$/.test(normalizedAmount) || BigInt(normalizedAmount) <= 0n) return [];
    const quantity = BigInt(normalizedAmount); const keepBps = BigInt(10_000 - marketFeeBps(insider));
    const make = (id: SaleStrategy["id"], label: string, price: bigint, confidence: string, note: string): SaleStrategy => ({ id, label, price, net: price * quantity * keepBps / 10_000n, confidence, note });
    return [
      ...(quick === null ? [] : [make("quick", "Quick sale", quick, lowest ? "High" : "Medium", lowest ? "Undercuts the current lowest ask for speed." : "Uses the median recent trade price; no active ask was returned.")]),
      make("balanced", "Balanced", balanced, available.length >= 3 ? "High" : available.length >= 2 ? "Medium" : "Low", "Uses available listing, trade, history, and volume signals."),
      make("patient", "Patient sale", patient, history.length >= 7 ? "Medium" : "Low", "Aims near the upper recent range; expect a longer wait."),
    ];
  }, [market.data, market.isFetching, market.error, marketItem, amount, insider]);

  const gap = result ? BigInt(result.shortfall) : 0n;
  const covering = strategies.find((strategy) => strategy.net >= gap && strategy.confidence !== "Low");
  const reliable = strategies.filter((strategy) => strategy.confidence !== "Low");
  const best = !result || !marketMatchesInput || gap === 0n ? null : covering ?? reliable.reduce<SaleStrategy | null>((choice, strategy) => !choice || strategy.net > choice.net ? strategy : choice, null);

  return <div className={shared.stack}>
    <PageHeader title="Ascension Calculator" description="Plan an exact target or find the highest tier and rank your current BC can afford." />
    {bcId && <Notice>{player.isLoading ? `Loading BcID ${bcId}…` : player.data ? `Prefilled from BcID ${bcId}. Edit any value before calculating.` : `Could not prefill BcID ${bcId}.`}</Notice>}
    <form onSubmit={calculate} className={`${shared.grid} ${shared.twoColumns}`}>
      <Card><CardHeader title="Progression target" description="Current live rule set · first ascension is free" /><CardBody className={styles.formGrid}>
        <Field label="Calculation mode"><NativeSelect name="ascension-mode" value={mode} onChange={(event) => setMode(event.target.value as "target" | "max")}><option value="target">Reach a target</option><option value="max">Max affordable</option></NativeSelect></Field>
        <Field label="Available BC"><Input name="available-bc" inputMode="numeric" value={balance} onChange={(event) => setBalance(event.target.value)} /></Field>
        <Field label="Current tier"><Input name="current-tier" type="number" min={0} value={currentTier} onChange={(event) => setCurrentTier(Number(event.target.value))} /></Field>
        <Field label="Current rank"><NativeSelect name="current-rank" value={currentRank} onChange={(event) => setCurrentRank(Number(event.target.value))}>{RANKS.map(([name], index) => <option key={name} value={index + 1}>{index + 1} · {name}</option>)}</NativeSelect></Field>
        {mode === "target" && <><Field label="Target tier"><Input name="target-tier" type="number" min={0} value={targetTier} onChange={(event) => setTargetTier(Number(event.target.value))} /></Field><Field label="Target rank"><NativeSelect name="target-rank" value={targetRank} onChange={(event) => setTargetRank(Number(event.target.value))}>{RANKS.map(([name], index) => <option key={name} value={index + 1}>{index + 1} · {name}</option>)}</NativeSelect></Field></>}
        <Field label="Nepotism" help="−2.5% rank cost per level"><Input name="nepotism-level" type="number" min={0} max={20} value={nepotism} onChange={(event) => setNepotism(Number(event.target.value))} /></Field>
        <Field label="Anointment" help="−2.5% ascension cost per level"><Input name="anointment-level" type="number" min={0} max={20} value={anointment} onChange={(event) => setAnointment(Number(event.target.value))} /></Field>
        <div className={styles.full}><Button type="submit" variant="primary" disabled={calculation.isPending}><ArrowFatLinesUp aria-hidden="true" />{calculation.isPending ? "Calculating…" : "Calculate ascension"}</Button></div>
        {(formError || calculation.error) && <div className={styles.full}><ErrorMessage>{formError ?? calculation.error?.message}</ErrorMessage></div>}
      </CardBody></Card>

      <Card><CardHeader title="Result" description={result ? `Ruleset ${result.rulesetVersion}` : "Run the calculation to see your destination and cost."} /><CardBody><div aria-live="polite">{!result ? <div className={styles.placeholder}><ArrowFatLinesUp aria-hidden="true" /><p>{calculation.data && resultInputKey !== inputKey ? "Inputs changed. Calculate again to update the destination and cost." : "Your destination, total cost, and remaining BC or shortfall will appear here."}</p></div> : <>
        <div className={styles.resultLead}><Badge tone={result.affordable ? "positive" : "warning"}>{result.affordable ? "Affordable" : "Shortfall"}</Badge><h2>{result.mode === "target" ? "Target" : "Reachable"} tier {result.reached.tier} · Rank {result.reached.rank} {RANKS[result.reached.rank - 1]?.[0]}</h2></div>
        <div className={styles.metricGrid}><div><span>Total cost</span><strong>{formatInteger(result.totalCost)} BC</strong></div><div><span>{result.affordable ? "Remaining" : "Still needed"}</span><strong>{formatInteger(result.affordable ? result.remaining : result.shortfall)} BC</strong></div></div>
      </>}</div></CardBody></Card>
    </form>

    <Card><CardHeader title="Ascension Runway" description="Compare the BC gap with recently loaded market prices." action={best ? <Badge tone={best.net >= gap ? "positive" : "warning"}>Modeled price: {best.label}</Badge> : undefined} /><CardBody>
      <div className={styles.runwayForm}>
        <Field label="Item to sell"><Input name="sale-item" list="runway-items" placeholder="Search any item…" value={itemText} onChange={(event) => setItemText(event.target.value)} /><datalist id="runway-items">{catalog.data?.items.map((item) => <option key={item.idName} value={item.name} />)}</datalist></Field>
        <Field label="Amount"><Input name="sale-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="Insider level"><Input name="insider-level" type="number" min={0} max={45} value={insider} onChange={(event) => setInsider(Number(event.target.value))} /></Field>
        <Field label="Mercantilist level"><Input name="mercantilist-level" type="number" min={0} max={61} value={mercantilist} onChange={(event) => setMercantilist(Number(event.target.value))} /></Field>
        <Button type="button" onClick={analyzeMarket} disabled={!selectedItem || !result}><CurrencyCircleDollar aria-hidden="true" />Price my exit</Button>
      </div>
      {!result && <Notice>Calculate an ascension target first so Runway knows the BC gap.</Notice>}
      {result && marketItem && !marketMatchesInput && <Notice>Item changed. Price the selected item again to update the market comparison.</Notice>}
      {marketMatchesInput && market.error && <ErrorMessage>{market.error.message}</ErrorMessage>}
      {marketMatchesInput && market.isFetching && <p className={styles.muted}>Loading listings, trades, price history, and volume…</p>}
      {result && marketMatchesInput && marketItem && market.data && !market.isFetching && !market.error && <>
        {marketItem.mercantilistLevel !== null && mercantilist < marketItem.mercantilistLevel && <ErrorMessage>{marketItem.name} requires Mercantilist {marketItem.mercantilistLevel}. Recommendations below are hypothetical until it is unlocked.</ErrorMessage>}
        <div className={styles.strategyGrid}>{strategies.map((strategy) => <article key={strategy.id} className={best?.id === strategy.id ? styles.bestStrategy : undefined}><div className={styles.strategyTitle}><h3>{strategy.label}</h3>{best?.id === strategy.id && <Sparkle aria-hidden="true" weight="fill" />}</div><strong>{formatInteger(strategy.price)} BC each</strong><span>{formatInteger(strategy.net)} BC net if all units sell, after {(marketFeeBps(insider) / 100).toFixed(1)}% fee</span><p>{strategy.note}</p><small>{strategy.confidence} price evidence</small></article>)}</div>
        {!best && <Notice>{gap === 0n ? "This ascension target already has no BC shortfall to cover." : strategies.length === 0 ? "No usable market price evidence is available for this item." : "Market evidence is too thin to recommend a listing price."}</Notice>}
        {best && <div className={styles.decision} aria-live="polite"><CheckCircle aria-hidden="true" weight="fill" /><div><strong>{best.net >= gap ? `${best.label} models ${formatInteger(best.price)} BC per unit.` : `${best.label} gives the highest modeled proceeds, but does not close the gap.`}</strong><p>{best.net >= gap ? `If all ${formatInteger(amount.replaceAll(",", "").trim())} units sell at that price, net proceeds exceed the ${formatInteger(gap)} BC shortfall by ${formatInteger(best.net - gap)} BC.` : `If all units sell at that price, the modeled deficit is ${formatInteger(gap - best.net)} BC.`}</p></div></div>}
      </>}
    </CardBody></Card>
  </div>;
}
