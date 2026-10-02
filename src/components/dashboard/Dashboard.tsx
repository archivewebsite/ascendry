"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, BellRinging, BellSlash, Circuitry, ClockCounterClockwise, Trash, ChartLineUp, ListChecks, ShieldCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrbVisual } from "@/components/ui/OrbVisual";
import { Badge, Button, Card, CardBody, CardHeader, uiStyles } from "@/components/ui";
import { formatInteger } from "@/lib/quantity";
import type { CatalogItem, SavedPlan, WatchAlert } from "@/lib/types";
import styles from "@/app/pages.module.css";
import bench from "./Dashboard.module.css";

async function json<T>(url: string): Promise<T> { const response = await fetch(url); if (!response.ok) throw new Error("Local data could not be loaded."); return response.json() as Promise<T>; }

export function Dashboard() {
  const client = useQueryClient();
  const items = useQuery({ queryKey: ["items"], queryFn: () => json<{ items: CatalogItem[] }>("/api/items") });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => json<{ plans: SavedPlan[] }>("/api/plans") });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => json<{ alerts: WatchAlert[] }>("/api/watchlist") });
  const catalog = items.data?.items ?? [];
  const priced = catalog.filter((item) => item.market?.price != null);
  const movers = [...priced].filter((item) => typeof item.market?.delta.day === "number").sort((a, b) => Math.abs(b.market!.delta.day!) - Math.abs(a.market!.delta.day!)).slice(0, 8);
  const latest = catalog.find((item) => item.market)?.market?.snapshotAt ?? null;
  const triggered = (alerts.data?.alerts ?? []).filter((alert) => alert.triggeredAt);
  const updateAlert = useMutation({ mutationFn: async (alert: WatchAlert) => { const response = await fetch(`/api/watchlist/${alert.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idName: alert.idName, direction: alert.direction, threshold: alert.threshold, enabled: !alert.enabled }) }); if (!response.ok) throw new Error("Alert could not be updated."); }, onSuccess: () => void client.invalidateQueries({ queryKey: ["alerts"] }) });
  const removeAlert = useMutation({ mutationFn: async (id: string) => { const response = await fetch(`/api/watchlist/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Alert could not be removed."); }, onSuccess: () => void client.invalidateQueries({ queryKey: ["alerts"] }) });
  return <>
    <header className={bench.hero}>
      <div className={bench.introduction}><h1 className={bench.title}>Control bench</h1><p className={bench.description}>One deliberate view of market state, craft opportunities, and saved decisions. Prices change only when you refresh.</p>
        <div className={bench.actions}><Link href="/market" className={`${uiStyles.button} ${uiStyles.primary}`}>Open market <ArrowUpRight aria-hidden="true" /></Link><Link href="/craft" className={uiStyles.button}>Open Craft Lab <Circuitry aria-hidden="true" /></Link></div>
      </div>
      <figure className={bench.instrument}><OrbVisual size={184} animated className={bench.orb} /><figcaption className={bench.instrumentCaption}><span className={`${bench.signal} ${latest ? bench.signalReady : ""}`} aria-hidden="true" />{latest ? "Market snapshot captured" : "Awaiting a market snapshot"}</figcaption></figure>
    </header>
    <div className={bench.metrics}>
      <Metric label="Catalog" value={catalog.length ? String(catalog.length) : "—"} meta={`${catalog.filter((item) => item.craftable).length} craftable`} />
      <Metric label="Snapshot prices" value={priced.length ? String(priced.length) : "—"} meta={`${catalog.length - priced.length} unpriced`} />
      <Metric label="Saved plans" value={String(plans.data?.plans.length ?? 0)} meta="snapshot reproducible" />
      <Metric label="Market timestamp" value={latest ? new Date(latest).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No data"} meta={latest ? new Date(latest).toLocaleDateString() : "Connect in Settings"} />
    </div>
    <nav aria-label="Workbench shortcuts" className={bench.launches}>{[
      { href: "/market", label: "Market matrix", description: "Compare snapshot prices", icon: ChartLineUp },
      { href: "/craft", label: "Craft Lab", description: "Find a cheaper recipe path", icon: Circuitry },
      { href: "/plans", label: "Scenario plans", description: "Revisit saved calculations", icon: ListChecks },
      { href: "/tracker", label: "Profile tracker", description: "Plan from your inventory", icon: ShieldCheck },
    ].map(({ href, label, description, icon: Icon }) => <Link href={href as never} key={href} className={bench.launch}><Icon aria-hidden="true" /><span><strong>{label}</strong><small>{description}</small></span><ArrowUpRight aria-hidden="true" /></Link>)}</nav>
    {!latest && <div className={`${styles.alertStrip} ${styles.sectionGap}`}><ClockCounterClockwise size={19} /><div><strong>No market snapshot yet.</strong><div className="mutedText">The validated catalog is ready. Connect the API key in Settings to add prices and market tools.</div></div></div>}
    <div className={`${styles.grid} ${styles.twoColumns} ${styles.sectionGap}`}>
      <Card><CardHeader title="Largest 24-hour moves" description="Absolute percentage change from the latest preview" action={<Link href="/market"><Badge>Open market</Badge></Link>} /><CardBody>{movers.length ? <div className={styles.dividerRows}>{movers.map((item) => { const delta = item.market!.delta.day!; return <Link className={`${styles.row} ${styles.listRow}`} href={`/items/${item.idName}`} key={item.idName}><span className={styles.itemIdentity}><span className={styles.itemName}>{item.name}</span><span className={styles.itemMeta}>{formatInteger(item.market!.price!)} BC</span></span><Badge tone={delta >= 0 ? "positive" : "negative"}>{delta >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}{Math.abs(delta).toFixed(2)}%</Badge></Link>; })}</div> : <div className={uiStyles.empty}>Refresh the market to populate movers.</div>}</CardBody></Card>
      <div className={styles.stack}>
        <Card><CardHeader title="Watchlist" description="Price thresholds checked after each manual refresh" /><CardBody>{alerts.data?.alerts.length ? <div className={styles.dividerRows}>{alerts.data.alerts.slice(0, 8).map((alert) => { const item = catalog.find((entry) => entry.idName === alert.idName); return <div className={`${styles.row} ${styles.listRow}`} key={alert.id}><Link href={`/items/${alert.idName}`}><span className={styles.itemName}>{alert.itemName ?? item?.name ?? alert.idName}</span><span className={styles.itemMeta}>{item?.market?.price ? `${formatInteger(item.market.price)} BC at last refresh` : "Unpriced"} · {alert.direction} {formatInteger(alert.threshold)}</span></Link><span className={styles.actions}><Badge tone={alert.enabled ? "positive" : "neutral"}>{alert.enabled ? "Active" : "Paused"}</Badge><Button size="icon" aria-label={`${alert.enabled ? "Pause" : "Enable"} ${alert.itemName ?? alert.idName} alert`} onClick={() => updateAlert.mutate(alert)}>{alert.enabled ? <BellSlash /> : <BellRinging />}</Button><Button size="icon" variant="danger" aria-label={`Remove ${alert.itemName ?? alert.idName} alert`} onClick={() => { if (window.confirm(`Remove the ${alert.itemName ?? alert.idName} alert?`)) removeAlert.mutate(alert.id); }}><Trash /></Button></span></div>; })}</div> : <div className={uiStyles.empty}>Add a price alert from any item page.</div>}</CardBody></Card>
        <Card><CardHeader title="Triggered alerts" description="Evaluated only after manual refresh" /><CardBody>{triggered.length ? <div className={styles.dividerRows}>{triggered.slice(0, 5).map((alert) => <div className={`${styles.row} ${styles.listRow}`} key={alert.id}><span className={styles.inline}><BellRinging /><span className={styles.itemName}>{alert.itemName ?? alert.idName}</span></span><Badge tone="warning">{alert.direction} {formatInteger(alert.threshold)}</Badge></div>)}</div> : <div className={uiStyles.empty}>No alerts have fired.</div>}</CardBody></Card>
        <Card><CardHeader title="Recent plans" description="Saved calculations retain their original market and perk snapshot" /><CardBody>{plans.data?.plans.length ? <div className={styles.dividerRows}>{plans.data.plans.slice(0, 5).map((plan) => <Link href="/plans" className={`${styles.row} ${styles.listRow}`} key={plan.id}><span className={styles.inline}><Circuitry /><span className={styles.itemName}>{plan.name}</span></span><span className={styles.itemMeta}>{new Date(plan.updatedAt).toLocaleDateString()}</span></Link>)}</div> : <div className={uiStyles.empty}>Save a Craft Lab result to start comparing scenarios.</div>}</CardBody></Card>
      </div>
    </div>
  </>;
}

function Metric({ label, value, meta }: { label: string; value: string; meta: string }) { return <div className={bench.metric}><div className={bench.metricLabel}>{label}</div><div className={bench.metricValue}>{value}</div><div className={bench.metricMeta}>{meta}</div></div>; }
