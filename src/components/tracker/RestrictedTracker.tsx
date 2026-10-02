"use client";

import Link from "next/link";
import { ArrowsClockwise, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, NativeSelect, Notice } from "@/components/ui";
import { estimateDepot, normalizeMonitoredProfiles, planRestrictedCraft, progressDelta, TRACKED_STATS, type DepotQuote, type MonitoredProfile, type TrackerSnapshot } from "@/lib/restricted-tracker";
import { formatInteger } from "@/lib/quantity";
import { parseBcId } from "@/lib/input";
import { writeStoredValue } from "@/lib/client/storage";
import type { CatalogItem } from "@/lib/types";
import styles from "./RestrictedTracker.module.css";

const STORAGE_KEY = "ascendry.restrictedTracker.v1";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Bconomy request failed.");
  return body as T;
}

function fetchSnapshot(bcId: string) { return getJson<TrackerSnapshot>(`/api/players/${bcId}/tracker`); }

function metric(value: string, previous?: string) {
  const delta = progressDelta(value, previous);
  return <><strong>{formatInteger(value)}</strong>{delta !== null && delta !== "0" && <small className={BigInt(delta) > 0n ? styles.gain : styles.loss}>{BigInt(delta) > 0n ? "+" : ""}{formatInteger(delta)}</small>}</>;
}

export function RestrictedTracker() {
  const queryClient = useQueryClient();
  const [profiles, setProfiles] = useState<MonitoredProfile[]>([]);
  const [ready, setReady] = useState(false);
  const [bcIdInput, setBcIdInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const catalogQuery = useQuery({ queryKey: ["items"], queryFn: () => getJson<{ items: CatalogItem[] }>("/api/items"), staleTime: 60_000 });

  useEffect(() => {
    try { setProfiles(normalizeMonitoredProfiles(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"))); }
    catch { setProfiles([]); }
    setReady(true);
  }, []);
  useEffect(() => { if (ready) setStorageError(writeStoredValue(STORAGE_KEY, JSON.stringify(profiles)) ? null : "Tracker changes are available in this tab but could not be saved. Browser storage is unavailable."); }, [profiles, ready]);

  const saveSnapshot = useCallback((snapshot: TrackerSnapshot) => {
    setProfiles((current) => current.map((entry) => entry.bcId !== snapshot.bcId || entry.latest.refreshedAt === snapshot.refreshedAt
      ? entry
      : { ...entry, previous: entry.latest, latest: snapshot }));
  }, []);
  const updateProfile = useCallback((bcId: string, change: Partial<Pick<MonitoredProfile, "goal" | "depotQuotes">>) => {
    setProfiles((current) => current.map((entry) => entry.bcId === bcId ? { ...entry, ...change } : entry));
  }, []);

  async function monitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let bcId: string;
    try { bcId = String(parseBcId(bcIdInput.trim())); } catch { setError("Enter a positive BcID within the supported range."); return; }
    if (profiles.some((entry) => entry.bcId === bcId && entry.bcId !== editingId)) { setError("That profile is already monitored."); return; }
    if (!editingId && profiles.length >= 2) { setError("You can monitor up to two profiles. Change or remove one first."); return; }
    setPending(true); setError(null);
    try {
      const snapshot = await fetchSnapshot(bcId);
      const next: MonitoredProfile = { bcId, latest: snapshot, previous: null, goal: null, depotQuotes: {} };
      queryClient.setQueryData(["restricted-tracker", bcId], snapshot);
      setProfiles((current) => editingId ? current.map((entry) => entry.bcId === editingId ? next : entry) : [...current, next]);
      setBcIdInput(""); setEditingId(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { setPending(false); }
  }

  function change(bcId: string) { setEditingId(bcId); setBcIdInput(bcId); setError(null); }
  function stop(bcId: string) {
    if (!window.confirm("Stop monitoring this profile? Its saved snapshots, craft goal, and Depot quotes will be removed.")) return;
    setProfiles((current) => current.filter((entry) => entry.bcId !== bcId));
    if (editingId === bcId) { setEditingId(null); setBcIdInput(""); }
  }

  return <div className={styles.page}>
    <PageHeader title="Ironman & Hardcore tracker" description="Monitor up to two live Bconomy profiles and plan crafts from what each profile owns." />
    {storageError && <ErrorMessage>{storageError}</ErrorMessage>}
    {ready && (profiles.length < 2 || editingId) && <Card><CardHeader title={editingId ? "Change monitored profile" : "Monitor a profile"} description="Enter an Ironman or Hardcore BcID. The account type is checked against Bconomy." /><CardBody>
      <form className={styles.monitorForm} onSubmit={(event) => void monitor(event)}>
        <Field label="BcID"><Input name="tracked-bcid" value={bcIdInput} onChange={(event) => setBcIdInput(event.target.value)} inputMode="numeric" placeholder="Enter BcID…" /></Field>
        <Button type="submit" variant="primary" disabled={pending || !bcIdInput.trim()}><Plus aria-hidden="true" />{pending ? "Checking…" : editingId ? "Change profile" : "Monitor profile"}</Button>
        {editingId && <Button type="button" onClick={() => { setEditingId(null); setBcIdInput(""); setError(null); }}>Cancel</Button>}
      </form>
      {error && <div className={styles.formError}><ErrorMessage>{error}</ErrorMessage></div>}
    </CardBody></Card>}
    {ready && profiles.length === 0 && <Card><CardBody className={styles.empty}><h2>Pick your first restricted profile</h2><p>Its progression, inventory, and trophy changes will appear here after the first live lookup.</p></CardBody></Card>}
    {profiles.map((entry) => <TrackedCard key={entry.bcId} entry={entry} catalog={catalogQuery.data?.items ?? []} catalogError={catalogQuery.error?.message} onSnapshot={saveSnapshot} onUpdate={updateProfile} onChange={() => change(entry.bcId)} onStop={() => stop(entry.bcId)} />)}
  </div>;
}

function TrackedCard({ entry, catalog, catalogError, onSnapshot, onUpdate, onChange, onStop }: {
  entry: MonitoredProfile;
  catalog: CatalogItem[];
  catalogError?: string;
  onSnapshot: (snapshot: TrackerSnapshot) => void;
  onUpdate: (bcId: string, change: Partial<Pick<MonitoredProfile, "goal" | "depotQuotes">>) => void;
  onChange: () => void;
  onStop: () => void;
}) {
  const query = useQuery({ queryKey: ["restricted-tracker", entry.bcId], queryFn: () => fetchSnapshot(entry.bcId), staleTime: Infinity, retry: 1, refetchOnWindowFocus: false });
  useEffect(() => { if (query.data) onSnapshot(query.data); }, [query.data, onSnapshot]);
  const snapshot = query.data ?? entry.latest;
  const previous = entry.latest.refreshedAt === snapshot.refreshedAt ? entry.previous : entry.latest;
  const newTrophies = previous ? snapshot.trophies.filter((key) => !previous.trophies.includes(key)) : [];
  const craftable = useMemo(() => catalog.filter((item) => item.craftable), [catalog]);
  const goalId = entry.goal?.idName ?? craftable[0]?.idName ?? "";
  const goalQuantity = entry.goal?.quantity ?? "1";
  const selectedItem = catalog.find((item) => item.idName === goalId);
  const craftPlan = useMemo(() => {
    if (!goalId || !/^\d+$/.test(goalQuantity) || BigInt(goalQuantity) === 0n || catalog.length === 0) return null;
    try { return planRestrictedCraft(goalId, goalQuantity, catalog, snapshot.inventory); }
    catch { return null; }
  }, [goalId, goalQuantity, catalog, snapshot.inventory]);
  const depot = craftPlan ? estimateDepot(craftPlan, entry.depotQuotes) : null;
  const updateGoal = (idName: string, quantity: string) => onUpdate(entry.bcId, { goal: { idName, quantity } });
  const updateQuote = (idName: string, field: keyof DepotQuote, value: string) => onUpdate(entry.bcId, { depotQuotes: { ...entry.depotQuotes, [idName]: { price: entry.depotQuotes[idName]?.price ?? "", stock: entry.depotQuotes[idName]?.stock ?? "", [field]: value } } });

  return <div className={styles.profileSection}>
    <Card className={styles.hero}><CardBody>
      <div className={styles.heroTop}><div><div className={styles.profileMeta}><Badge tone={snapshot.mode === "hardcore" ? "warning" : "positive"}>{snapshot.mode === "hardcore" ? "Hardcore" : "Ironman"}</Badge><span>BcID {entry.bcId}</span></div><h2>{snapshot.name}</h2><p>Last checked {new Date(snapshot.refreshedAt).toLocaleString()}</p></div><div className={styles.actions}><Button size="small" onClick={() => void query.refetch()} disabled={query.isFetching}><ArrowsClockwise aria-hidden="true" className={query.isFetching ? "spin" : ""} />{query.isFetching ? "Refreshing…" : "Refresh"}</Button><Button size="small" onClick={onChange}><PencilSimple aria-hidden="true" />Change</Button><Button size="small" variant="danger" onClick={onStop}><Trash aria-hidden="true" />Stop</Button></div></div>
      {query.error && <div className={styles.queryError}><ErrorMessage>{query.error.message} Showing the last saved snapshot.</ErrorMessage></div>}
      <div className={styles.metrics}>
        <div><span>Tier</span>{metric(snapshot.tier, previous?.tier)}</div>
        <div><span>Rank</span>{metric(snapshot.rank, previous?.rank)}</div>
        <div><span>Quest level</span>{metric(snapshot.questLevel, previous?.questLevel)}</div>
        <div><span>Balance</span>{metric(snapshot.bc, previous?.bc)}<em>BC</em></div>
      </div>
    </CardBody></Card>
    <div className={styles.detailGrid}>
      <Card><CardHeader title="Progress since last check" description={previous ? `Compared with ${new Date(previous.refreshedAt).toLocaleString()}` : "Refresh again to see changes."} /><CardBody>
        <div className={styles.statGrid}>{TRACKED_STATS.map(([key, label]) => <div key={key}><span>{label}</span>{metric(snapshot.stats[key] ?? "0", previous?.stats[key])}</div>)}<div><span>Trophies</span>{metric(String(snapshot.trophies.length), previous ? String(previous.trophies.length) : undefined)}</div></div>
        {newTrophies.length > 0 && <Notice>New trophies: {newTrophies.join(", ")}</Notice>}
        <Link className={styles.explorerLink} href={`/players?bcId=${entry.bcId}`}>Open full player record →</Link>
      </CardBody></Card>
      <Card><CardHeader title="Restricted craft goal" description="Owned items are used first. No normal Market listings enter this plan." /><CardBody>
        {catalogError && <ErrorMessage>{catalogError}</ErrorMessage>}
        {craftable.length > 0 && <><div className={styles.goalFields}><Field label="Item"><NativeSelect value={goalId} onChange={(event) => updateGoal(event.target.value, goalQuantity)}>{craftable.map((item) => <option key={item.idName} value={item.idName}>{item.name}</option>)}</NativeSelect></Field><Field label="Quantity"><Input name={`goal-quantity-${entry.bcId}`} inputMode="numeric" value={goalQuantity} onChange={(event) => updateGoal(goalId, event.target.value)} /></Field></div>
          {(!/^\d+$/.test(goalQuantity) || BigInt(goalQuantity || "0") <= 0n) && <ErrorMessage>Enter a whole number greater than zero.</ErrorMessage>}
          {craftPlan && <><div className={styles.goalSummary}><div><span>Already owned</span><strong>{formatInteger(snapshot.inventory[goalId] ?? "0")}</strong></div><div><span>Craft steps</span><strong>{craftPlan.craftSteps.length}</strong></div><div><span>Material types short</span><strong>{craftPlan.deficits.length}</strong></div></div>
            {craftPlan.craftSteps.length > 0 && <div className={styles.stepList}><h3>Craft sequence</h3>{craftPlan.craftSteps.map((step) => <div key={step.idName}><span>{step.name}</span><strong>× {formatInteger(step.quantity)}</strong></div>)}</div>}
            {craftPlan.deficits.length === 0 ? <Notice>Inventory covers {selectedItem?.name ?? "this goal"} and its ingredients.</Notice> : <><p className={styles.depotIntro}>Enter current Depot unit price and stock only for items you can buy there. Leave unavailable items blank; gather those materials through their listed sources.</p><div className={styles.deficits}>{craftPlan.deficits.map((deficit) => <div key={deficit.idName} className={styles.deficit}><div><strong>{deficit.name}</strong><span>Need {formatInteger(deficit.quantity)} · {deficit.lootSources.length ? deficit.lootSources.join(", ") : "Source unknown"}</span></div><Input name={`depot-price-${entry.bcId}-${deficit.idName}`} aria-label={`${deficit.name} Depot unit price`} inputMode="numeric" placeholder="BC each" value={entry.depotQuotes[deficit.idName]?.price ?? ""} onChange={(event) => updateQuote(deficit.idName, "price", event.target.value)} /><Input name={`depot-stock-${entry.bcId}-${deficit.idName}`} aria-label={`${deficit.name} Depot stock`} inputMode="numeric" placeholder="Stock" value={entry.depotQuotes[deficit.idName]?.stock ?? ""} onChange={(event) => updateQuote(deficit.idName, "stock", event.target.value)} /></div>)}</div><div className={styles.depotTotal}><span>Quoted Depot spend</span><strong>{formatInteger(depot!.knownCost)} BC</strong><small>{formatInteger(depot!.covered)} covered · {formatInteger(depot!.outstanding)} still to source</small></div></>}
          </>}
        </>}
      </CardBody></Card>
    </div>
  </div>;
}
