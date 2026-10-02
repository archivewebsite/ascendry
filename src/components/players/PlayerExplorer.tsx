"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowSquareOut, ArrowsClockwise, MagnifyingGlass, ShieldWarning } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, Notice } from "@/components/ui";
import { formatInteger } from "@/lib/quantity";
import shared from "@/app/pages.module.css";
import styles from "./PlayerExplorer.module.css";

type JsonRecord = Record<string, unknown>;
type TabId = "overview" | "inventory" | "pets" | "farm" | "relay" | "listings" | "activity" | "internal";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "inventory", label: "Inventory" },
  { id: "pets", label: "Pets & eggs" },
  { id: "farm", label: "Farm" },
  { id: "relay", label: "Relay" },
  { id: "listings", label: "Listings" },
  { id: "activity", label: "Activity" },
  { id: "internal", label: "Internal data" },
];

const playerQueryOptions = {
  staleTime: Infinity,
  gcTime: 30 * 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value !== null && typeof value === "object" ? Object.values(value as JsonRecord) : [];
}

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if ((typeof value === "string" || typeof value === "number") && /^-?\d+$/.test(String(value))) {
    try { return formatInteger(String(value)); } catch { return String(value); }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getName(value: unknown) {
  const item = record(value);
  return String(item.name ?? item.username ?? `BcID ${item.id ?? "?"}`);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Bconomy request failed.");
  return body as T;
}

function KeyValueGrid({ data, keys }: { data: JsonRecord; keys: Array<[string, string]> }) {
  return <dl className={styles.definitionGrid}>{keys.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{display(data[key])}</dd></div>)}</dl>;
}

function RawJson({ value, label = "Raw endpoint response" }: { value: unknown; label?: string }) {
  return <details className={styles.raw}><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

function UnknownCards({ values, empty }: { values: unknown[]; empty: string }) {
  if (values.length === 0) return <Notice>{empty}</Notice>;
  return <div className={styles.objectGrid}>{values.map((value, index) => {
    const item = record(value);
    const heading = String(item.name ?? item.species ?? item.type ?? item.idName ?? `Entry ${index + 1}`);
    return <article className={styles.objectCard} key={String(item.id ?? item.eggId ?? index)}><h3>{heading}</h3><dl>{Object.entries(item).slice(0, 12).map(([key, cell]) => <div key={key}><dt>{key}</dt><dd title={display(cell)}>{display(cell)}</dd></div>)}</dl><RawJson value={value} label="All fields" /></article>;
  })}</div>;
}

export function PlayerExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialBcId = searchParams.get("bcId") ?? "";
  const [input, setInput] = useState(initialBcId);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set(["overview"]));
  const [activityPage, setActivityPage] = useState(1);
  const bcId = /^\d+$/.test(initialBcId) ? initialBcId : "";

  const search = useQuery({
    queryKey: ["player-search", searchTerm],
    queryFn: () => getJson<{ users: unknown[] }>(`/api/players/search?q=${encodeURIComponent(searchTerm)}`),
    enabled: searchTerm.length >= 2,
    ...playerQueryOptions,
  });
  const overview = useQuery({
    queryKey: ["player", bcId, "overview"],
    queryFn: () => getJson<JsonRecord>(`/api/players/${bcId}/overview`),
    enabled: Boolean(bcId),
    ...playerQueryOptions,
  });
  const inventory = useQuery({ queryKey: ["player", bcId, "inventory"], queryFn: () => getJson<JsonRecord>(`/api/players/${bcId}/inventory`), enabled: Boolean(bcId) && visited.has("inventory"), ...playerQueryOptions });
  const pets = useQuery({ queryKey: ["player", bcId, "pets"], queryFn: () => getJson<JsonRecord>(`/api/players/${bcId}/pets`), enabled: Boolean(bcId) && visited.has("pets"), ...playerQueryOptions });
  const listings = useQuery({ queryKey: ["player", bcId, "listings"], queryFn: () => getJson<JsonRecord>(`/api/players/${bcId}/listings`), enabled: Boolean(bcId) && visited.has("listings"), ...playerQueryOptions });
  const activity = useQuery({ queryKey: ["player", bcId, "activity", activityPage], queryFn: () => getJson<JsonRecord>(`/api/players/${bcId}/activity?page=${activityPage}&pageSize=50`), enabled: Boolean(bcId) && visited.has("activity"), ...playerQueryOptions });
  const internal = useQuery({ queryKey: ["player", bcId, "internal"], queryFn: () => getJson<JsonRecord>(`/api/players/${bcId}/internal`), enabled: Boolean(bcId) && visited.has("internal"), ...playerQueryOptions });

  const user = record(overview.data?.user);
  const profile = record(overview.data?.profile);
  const stats = record(overview.data?.stats);
  const isRefreshing = [overview, inventory, pets, listings, activity, internal].some((query) => query.isFetching && !query.isLoading);
  const currentError = overview.error ?? (activeTab === "inventory" ? inventory.error : activeTab === "pets" ? pets.error : activeTab === "listings" ? listings.error : activeTab === "activity" ? activity.error : activeTab === "internal" ? internal.error : null);

  function selectPlayer(id: unknown) {
    const next = String(id ?? "");
    if (!/^\d+$/.test(next)) return;
    setInput(next);
    setSearchTerm("");
    setActiveTab("overview");
    setVisited(new Set(["overview"]));
    setActivityPage(1);
    router.push(`/players?bcId=${encodeURIComponent(next)}` as never);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (/^\d+$/.test(value)) selectPlayer(value);
    else setSearchTerm(value);
  }

  function chooseTab(next: TabId) {
    setActiveTab(next);
    setVisited((current) => new Set(current).add(next));
  }

  async function refreshPlayer() {
    if (!bcId) return;
    const keys: Array<readonly unknown[]> = [...visited].filter((tab) => !["farm", "relay", "activity"].includes(tab)).map((tab) => ["player", bcId, tab] as const);
    if (visited.has("activity")) keys.push(["player", bcId, "activity", activityPage]);
    if ((visited.has("farm") || visited.has("relay")) && !visited.has("overview")) keys.push(["player", bcId, "overview"]);
    await Promise.all(keys.map((queryKey) => queryClient.refetchQueries({ queryKey, exact: true, type: "all" })));
  }

  const farmPlots = list(user.farmPlots);
  const relay = record(user.relay);
  const generators = list(user.generators);
  const petData = record(pets.data?.data);
  const petRows = Array.isArray(pets.data?.data) ? list(pets.data?.data) : [...list(petData.pets), ...list(petData.eggs)];
  const listingRows = list(listings.data?.data);
  const activityEnvelope = record(activity.data?.data);
  const activityRows = list(activityEnvelope.entries);
  const title = String(user.name ?? profile.name ?? (bcId ? `BcID ${bcId}` : "Player Explorer"));
  const registered = typeof user.registrationDate === "string" ? new Date(user.registrationDate).toLocaleString() : "—";

  return <div className={shared.stack}>
    <PageHeader title="Player Explorer" description="Inspect live Bconomy profile data by BcID. Nothing from player lookups is written to disk." action={bcId ? <Button onClick={() => void refreshPlayer()} disabled={isRefreshing}><ArrowsClockwise aria-hidden="true" className={isRefreshing ? "spin" : ""} />{isRefreshing ? "Refreshing…" : "Refresh player"}</Button> : undefined} />

    <Card><CardBody>
      <form className={styles.searchBar} onSubmit={submit}>
        <Field label="BcID or player name" help="BcID opens directly; names return up to 20 matches."><Input name="player-query" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Enter BcID or search a name…" /></Field>
        <Button type="submit" variant="primary" disabled={!input.trim()}><MagnifyingGlass aria-hidden="true" />Find player</Button>
      </form>
      {search.isLoading && <p className={styles.muted}>Searching Bconomy…</p>}
      {search.error && <ErrorMessage>{search.error.message}</ErrorMessage>}
      {search.data && <div className={styles.searchResults}>{search.data.users.length === 0 ? <Notice>No matching players found.</Notice> : search.data.users.map((entry) => {
        const candidate = record(entry);
        return <button key={String(candidate.id)} type="button" onClick={() => selectPlayer(candidate.id)}><span>{getName(candidate)}</span><span>BcID {display(candidate.id)} · Tier {display(candidate.tier)} · Rank {display(candidate.rank)}</span></button>;
      })}</div>}
    </CardBody></Card>

    {!bcId && <Card><CardBody className={styles.emptyState}><MagnifyingGlass aria-hidden="true" /><h2>Open a live player record</h2><p>Search by name or enter a BcID to inspect profile, inventory, pets, farm, Relay, listings, activity, and the complete internal payload.</p></CardBody></Card>}
    {bcId && overview.isLoading && <Card><CardBody><p className={styles.muted}>Loading player {bcId}…</p></CardBody></Card>}
    {currentError && <ErrorMessage>{currentError.message}</ErrorMessage>}

    {bcId && overview.data && <>
      <Card className={styles.hero}><CardBody>
        <div className={styles.heroTop}><div><div className={styles.eyebrow}>BcID {bcId}</div><h2>{title}</h2><p>Registered {registered}{user.factionTag ? ` · ${String(user.factionTag)}` : ""}</p></div><div className={shared.actions}><Link className={styles.actionLink} href={{ pathname: "/calculators/ascension", query: { bcId } }}>Ascension <ArrowSquareOut aria-hidden="true" /></Link><Link className={styles.actionLink} href={{ pathname: "/calculators/boss-damage", query: { bcId } }}>Boss damage <ArrowSquareOut aria-hidden="true" /></Link></div></div>
        <div className={styles.heroMetrics}><div><span>Balance</span><strong>{display(user.bc)} BC</strong></div><div><span>Progress</span><strong>Tier {display(user.tier)} · Rank {display(user.rank)}</strong></div><div><span>Store points</span><strong>{display(user.sp)}</strong></div><div><span>Karma</span><strong>{display(user.kr)}</strong></div></div>
      </CardBody></Card>

      <nav className={styles.tabs} aria-label="Player data sections">{tabs.map((tab) => <button type="button" key={tab.id} aria-pressed={activeTab === tab.id} onClick={() => chooseTab(tab.id)}>{tab.label}</button>)}</nav>

      {activeTab === "overview" && <div className={`${shared.grid} ${shared.twoColumns}`}>
        <Card><CardHeader title="General details" description="Core account state from the live user record." /><CardBody><KeyValueGrid data={user} keys={[["id","BcID"],["name","Name"],["type","Account type"],["registrationDate","Registered"],["tier","Tier"],["rank","Rank"],["bc","BC"],["sp","Store points"],["kr","Karma"],["questLevel","Quest level"],["dailyClaimStreak","Daily streak"],["buddyId","Buddy BcID"],["premiumExpiryDate","Premium expiry"],["banExpiryDate","Ban expiry"]]} /></CardBody></Card>
        <div className={shared.stack}>
          <Card><CardHeader title="Faction" /><CardBody><KeyValueGrid data={record(overview.data.faction)} keys={[["id","ID"],["name","Name"],["tag","Tag"],["ownerBcId","Owner"],["bc","Vault BC"]]} /><RawJson value={overview.data.faction} /></CardBody></Card>
          <Card><CardHeader title="Selected lifetime stats" /><CardBody><KeyValueGrid data={stats} keys={[["timesFished","Times fished"],["timesHunted","Times hunted"],["timesMined","Times mined"],["marketListingsRevenue","Market revenue"],["bcEarnedFromMintTotal","Relay mint total"],["salvageEarnedTotal","Salvage earned"],["itemsRefined","Items refined"]]} /><RawJson value={stats} label="All stats" /></CardBody></Card>
          <Card><CardHeader title="Boosts, upgrades, and augments" description="Current action effects and permanent upgrade state." /><CardBody><RawJson value={{ effects: user.effects, upgrades: user.upgrades, augments: user.augments, equippedFlatInventory: user.equippedFlatInventory, globalActionBoosts: record(overview.data.gameState).globalActionBoosts }} label="View boost details" /></CardBody></Card>
          <Card><CardHeader title="Trophies" /><CardBody><RawJson value={overview.data.trophies} label="View trophy record" /></CardBody></Card>
        </div>
      </div>}

      {activeTab === "inventory" && <Card><CardHeader title="Inventory" description={`${list(inventory.data?.items).length} owned item types`} /><CardBody>{inventory.isLoading ? <p className={styles.muted}>Loading inventory…</p> : <div className={styles.inventoryGrid}>{list(inventory.data?.items).map((entry) => { const item = record(entry); return <article key={String(item.idName)}><span className={styles.itemEmoji}>{String(item.emoji ?? "")}</span><div><strong>{String(item.name)}</strong><span>{display(item.amount)}</span></div></article>; })}</div>}<RawJson value={inventory.data?.inventory} /></CardBody></Card>}

      {activeTab === "pets" && <Card><CardHeader title="Pets and eggs" description="All returned pet, egg, adventure, craving, skin, and aura fields." /><CardBody>{pets.isLoading ? <p className={styles.muted}>Loading pets and eggs…</p> : <UnknownCards values={petRows} empty="No pets or eggs were returned." />}<RawJson value={pets.data?.data} /></CardBody></Card>}

      {activeTab === "farm" && <Card><CardHeader title="Farm" description={`${farmPlots.length} plot records`} /><CardBody><UnknownCards values={farmPlots} empty="This player has no farm plot records." /><RawJson value={user.farmPlots} /></CardBody></Card>}

      {activeTab === "relay" && <div className={shared.stack}>
        <Card><CardHeader title="Relay Network" description="Bays, modules, upgrades, research, salvage, store, routing, and state." /><CardBody>{Object.keys(relay).length ? <><KeyValueGrid data={relay} keys={[["salvage","Salvage"],["activeAnchor","Active anchor"],["autoDeposit","Auto deposit"],["researchCostPaid","Research cost paid"]]} /><UnknownCards values={collection(relay.bays)} empty="No Relay bays were returned." /><RawJson value={relay} /></> : <Notice>No migrated Relay Network data was returned.</Notice>}</CardBody></Card>
        <Card><CardHeader title="Legacy generators" description="Shown separately for players who have not migrated fully to Relay." /><CardBody><UnknownCards values={generators} empty="No legacy generator records were returned." /><RawJson value={user.generators} /></CardBody></Card>
      </div>}

      {activeTab === "listings" && <Card><CardHeader title="Current market listings" description={`${listingRows.length} listing records`} /><CardBody>{listings.isLoading ? <p className={styles.muted}>Loading listings…</p> : <UnknownCards values={listingRows.map((entry) => { const row = record(entry); const catalog = record(listings.data?.catalog); const item = record(catalog[String(row.itemId)]); return { ...row, itemName: item.name, itemEmoji: item.emoji }; })} empty="No active listings were returned." />}<RawJson value={listings.data?.data} /></CardBody></Card>}

      {activeTab === "activity" && <Card><CardHeader title="Recent activity" description={`${display(activityEnvelope.total)} total entries · showing page ${display(activityEnvelope.page ?? activityPage)}`} action={<div className={shared.actions}><Button size="small" variant="quiet" disabled={activityPage <= 1 || activity.isFetching} onClick={() => setActivityPage((page) => page - 1)}>Previous</Button><Button size="small" variant="quiet" disabled={activity.isFetching || activityRows.length < 50} onClick={() => setActivityPage((page) => page + 1)}>Next</Button></div>} /><CardBody>{activity.isLoading ? <p className={styles.muted}>Loading activity…</p> : <UnknownCards values={activityRows} empty="No activity entries were returned." />}<RawJson value={activity.data?.data} /></CardBody></Card>}

      {activeTab === "internal" && <Card><CardHeader title="Complete internal record" description="Lossless user, profile, stats, and trophy payloads, including unknown fields added by Bconomy." /><CardBody><div className={styles.warning}><ShieldWarning aria-hidden="true" /><div><strong>Sensitive account fields are visible</strong><p>This view intentionally includes settings, moderation state, blocked BcIDs, identifiers, custom profile data, and every other field returned by the API.</p></div></div>{internal.isLoading ? <p className={styles.muted}>Loading internal fields…</p> : <><div className={styles.internalFields}>{Object.entries(record(record(internal.data?.data).user)).map(([key, value]) => <div key={key}><span>{key}</span><code>{display(value)}</code></div>)}</div><RawJson value={internal.data?.data} label="Full raw JSON" /></>}</CardBody></Card>}
    </>}
  </div>;
}
