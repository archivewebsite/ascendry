"use client";

import Link from "next/link";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, NativeSelect } from "@/components/ui";
import { BOOSTER_ITEMS, BOOSTER_TIERS, TIME_UNITS, durationForItems, formatDuration, itemsForDuration, parseWholeNumber, quoteBoosterBasket, quoteBoosterCost, type BoosterAction } from "@/lib/boosters";
import { formatInteger } from "@/lib/quantity";
import type { CatalogItem, MarketListing } from "@/lib/types";
import shared from "@/app/pages.module.css";
import styles from "./BoosterCalculator.module.css";

type MarketData = {
  items: Array<{ idName: string; name: string; craftable: boolean }>;
  catalog: CatalogItem[];
  orderBooks: Record<string, MarketListing[]>;
  checkedAt: string;
  cached: boolean;
};
type Quote = ReturnType<typeof quoteBoosterCost>;

function Cost({ quote, quantity, loading }: { quote: Quote | null; quantity: bigint | null; loading: boolean }) {
  if (quantity === null) return <span className={styles.error}>Fix the item count.</span>;
  if (quantity === 0n) return <span className={styles.mono}>0 BC</span>;
  if (!quote) return <span className={styles.emptyCost}>{loading ? "Loading market…" : "Price unavailable"}</span>;
  if (quote.cost !== null) return <strong className={styles.costValue}>{formatInteger(quote.cost)} BC</strong>;
  const source = quote.method === "Buy" ? "item" : "ingredient";
  if (quote.estimate !== null) return <span className={styles.costCell}><strong className={styles.costValue}>~{formatInteger(quote.estimate)} BC</strong><small>Lowest ask estimate · {quote.unfilled.length} {source} {quote.unfilled.length === 1 ? "type" : "types"} short; full cost unknown.</small></span>;
  return <span className={styles.costCell}><strong className={styles.emptyCost}>Full cost unavailable</strong><small>{quote.unfilled.length} {source} {quote.unfilled.length === 1 ? "type has" : "types have"} no full supply. Known subtotal: {formatInteger(quote.knownCost)} BC.</small></span>;
}

export function BoosterCalculator() {
  const [action, setAction] = useState<BoosterAction>("explore");
  const [refreshId, setRefreshId] = useState(0);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Record<string, string>>({});

  const selection = BOOSTER_ITEMS[action];
  const market = useQuery({
    queryKey: ["booster-market", action, refreshId],
    queryFn: async (): Promise<MarketData> => {
      const response = await fetch("/api/calculators/boosters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemIds: selection.map(({ idName }) => idName), force: refreshId > 0 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Booster prices could not be loaded.");
      return body as MarketData;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const catalog = market.data?.catalog ?? [];
  const catalogById = new Map(catalog.map((item) => [item.idName, item]));
  const quoteFor = (idName: string, quantity: bigint | null) => {
    const item = catalogById.get(idName);
    return item && quantity !== null && market.data ? quoteBoosterCost(item, quantity, catalog, market.data.orderBooks) : null;
  };

  const itemRows = BOOSTER_TIERS.map(({ tier, minutes }, index) => {
    const item = selection[index]!;
    const count = parseWholeNumber(counts[tier] ?? "");
    return { tier, minutes, item, count, quote: quoteFor(item.idName, count) };
  });
  const countsValid = itemRows.every(({ count }) => count !== null);
  const totalSeconds = countsValid ? itemRows.reduce((sum, { count, minutes }) => sum + durationForItems(count ?? 0n, minutes), 0n) : null;
  const pricedRows = itemRows.filter(({ count }) => count !== null && count > 0n);
  const basket = countsValid && pricedRows.every(({ quote }) => quote !== null) ? quoteBoosterBasket(pricedRows.map(({ quote }) => quote!), market.data?.orderBooks ?? {}) : null;
  const totalCost = basket?.cost ?? null;
  const totalEstimate = basket?.estimate ?? null;

  const targetValues = TIME_UNITS.map(({ label, seconds }) => ({ label, seconds, value: parseWholeNumber(target[label] ?? "") }));
  const targetValid = targetValues.every(({ value }) => value !== null);
  const targetEntered = TIME_UNITS.some(({ label }) => Boolean(target[label]?.trim()));
  const targetSeconds = targetValid ? targetValues.reduce((sum, { value, seconds }) => sum + (value ?? 0n) * seconds, 0n) : null;

  return <div className={shared.stack}>
    <PageHeader title="Booster Calculator" description="Convert T1–T6 booster items into time and price the items needed using live market listings." />
    <p className={styles.convention}>T1–T6 last 15, 30, 60, 120, 240, and 480 minutes per item. Craftable boosters use direct recipes; uncraftable boosters use their market listings. Time breakdowns use 365 days per year and 30 days per month.</p>
    <div className={styles.marketToolbar}>
      <Field label="Boost action"><NativeSelect value={action} onChange={(event) => setAction(event.target.value as BoosterAction)}><option value="explore">Explore</option><option value="fish">Fish</option><option value="hunt">Hunt</option><option value="mine">Mine</option></NativeSelect></Field>
      <Button type="button" onClick={() => setRefreshId((value) => value + 1)} disabled={market.isFetching}><ArrowsClockwise aria-hidden="true" />{market.isFetching ? "Loading prices…" : "Refresh prices"}</Button>
      <span className={styles.marketStatus}>{market.data ? `Market listings checked ${new Date(market.data.checkedAt).toLocaleTimeString()}${market.data.cached ? " · recent cache" : ""}` : market.isPending ? "Loading live listings…" : "Live pricing unavailable"}</span>
    </div>
    {market.error && <ErrorMessage>{market.error.message} <Link href="/settings" className={styles.settingsLink}>Open Settings</Link></ErrorMessage>}

    <Card className={styles.card}>
      <CardHeader title="Items → duration and cost" description="Enter the number of boosters. Costs use live listing depth for direct ingredients or the item itself." />
      <CardBody>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Tier</th><th scope="col">Item</th><th scope="col">Each item</th><th scope="col">Item count</th><th scope="col">Total duration</th><th scope="col">Total cost</th></tr></thead>
            <tbody>{itemRows.map(({ tier, minutes, item, count, quote }) => <tr key={tier}>
              <th scope="row" className={styles.tier}>{tier}</th>
              <td data-label="Item"><Link href={`/items/${item.idName}`} className={styles.itemLink}>{catalogById.get(item.idName)?.name ?? item.name}</Link><small className={styles.itemMethod}>{quote?.method ?? ""}</small></td>
              <td className={styles.mono} data-label="Each item">{formatInteger(BigInt(minutes))} minutes</td>
              <td data-label="Item count"><Input aria-label={`${tier} item count`} aria-invalid={count === null} inputMode="numeric" value={counts[tier] ?? ""} onChange={(event) => setCounts({ ...counts, [tier]: event.target.value })} /></td>
              <td className={styles.duration} data-label="Total duration">{count === null ? <span className={styles.error}>Enter a whole item count.</span> : formatDuration(durationForItems(count, minutes))}</td>
              <td className={styles.cost} data-label="Total cost"><Cost quote={quote} quantity={count} loading={market.isPending} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className={styles.summaryGrid} aria-live="polite"><div className={styles.summary}><span>All entered items</span><strong>{totalSeconds === null ? "Fix the item counts above." : formatDuration(totalSeconds)}</strong></div><div className={styles.summary}><span>Cost for entered items</span><strong>{!countsValid ? "Fix the item counts above." : totalCost !== null ? `${formatInteger(totalCost)} BC` : totalEstimate !== null ? `~${formatInteger(totalEstimate)} BC estimated` : market.isPending ? "Loading market…" : "Full cost unavailable"}</strong>{basket && totalCost === null && <small>{totalEstimate !== null ? "Lowest ask estimate; " : ""}Current listings cover {formatInteger(basket.knownCost)} BC of ingredients or items. Full purchase cost is unknown.</small>}</div></div>
      </CardBody>
    </Card>

    <Card className={styles.card}>
      <CardHeader title="Target duration → items and cost" description="Set a duration to compare each tier on its own. Item counts round up to cover the full target." />
      <CardBody>
        <div className={styles.targetGrid}>{TIME_UNITS.map(({ label }) => {
          const value = targetValues.find((entry) => entry.label === label)?.value;
          return <Field key={label} label={label}><Input aria-invalid={value === null} inputMode="numeric" value={target[label] ?? ""} onChange={(event) => setTarget({ ...target, [label]: event.target.value })} /></Field>;
        })}</div>
        {!targetValid && <p className={styles.error} role="alert">Enter non-negative whole numbers for the target duration.</p>}
        {targetValid && !targetEntered && <p className={styles.empty}>Enter a target duration to see the items needed for each tier.</p>}
        {targetValid && targetEntered && targetSeconds !== null && <>
          <div className={styles.summary} aria-live="polite"><span>Target duration</span><strong>{formatDuration(targetSeconds)}</strong></div>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Tier</th><th scope="col">Item</th><th scope="col">Each item</th><th scope="col">Items needed</th><th scope="col">Total cost</th></tr></thead>
              <tbody>{BOOSTER_TIERS.map(({ tier, minutes }, index) => {
                const item = selection[index]!;
                const quantity = itemsForDuration(targetSeconds, minutes);
                const quote = quoteFor(item.idName, quantity);
                return <tr key={tier}>
                <th scope="row" className={styles.tier}>{tier}</th>
                <td data-label="Item"><Link href={`/items/${item.idName}`} className={styles.itemLink}>{catalogById.get(item.idName)?.name ?? item.name}</Link><small className={styles.itemMethod}>{quote?.method ?? ""}</small></td>
                <td className={styles.mono} data-label="Each item">{formatInteger(BigInt(minutes))} minutes</td>
                <td className={styles.quantity} data-label="Items needed">{formatInteger(quantity)}</td>
                <td className={styles.cost} data-label="Total cost"><Cost quote={quote} quantity={quantity} loading={market.isPending} /></td>
              </tr>; })}</tbody>
            </table>
          </div>
        </>}
      </CardBody>
    </Card>
  </div>;
}
