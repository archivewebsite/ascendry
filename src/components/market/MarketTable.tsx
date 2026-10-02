"use client";

import Link from "next/link";
import { CaretDown, CaretLeft, CaretRight, CaretUp, Star } from "@phosphor-icons/react";
import { createColumnHelper, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Card, CardBody, Field, Input, NativeSelect, uiStyles } from "@/components/ui";
import { NumberValue } from "@/components/ui/NumberValue";
import type { CatalogItem, WatchAlert } from "@/lib/types";
import styles from "@/app/pages.module.css";

const column = createColumnHelper<CatalogItem>();
async function load<T>(url: string) { const response = await fetch(url); if (!response.ok) throw new Error("Market data could not be loaded."); return response.json() as Promise<T>; }

export function MarketTable() {
  const searchRef = useRef<HTMLInputElement>(null);
  const query = useQuery({ queryKey: ["items"], queryFn: () => load<{ items: CatalogItem[] }>("/api/items") });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => load<{ alerts: WatchAlert[] }>("/api/watchlist") });
  const [search, setSearch] = useState(""); const [craftability, setCraftability] = useState("all"); const [trend, setTrend] = useState("all"); const [source, setSource] = useState("all"); const [attribute, setAttribute] = useState("all"); const [mercLevel, setMercLevel] = useState("61"); const [watchedOnly, setWatchedOnly] = useState(false); const [sorting, setSorting] = useState<SortingState>([{ id: "price", desc: true }]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("focus") === "search") searchRef.current?.focus(); }, []);
  const watched = useMemo(() => new Set((alerts.data?.alerts ?? []).map((alert) => alert.idName)), [alerts.data]);
  const allItems = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const lootSources = useMemo(() => [...new Set(allItems.flatMap((item) => item.lootSources))].sort(), [allItems]);
  const attributes = useMemo(() => [...new Set(allItems.flatMap((item) => item.attributes))].sort(), [allItems]);
  const filtered = useMemo(() => allItems.filter((item) => {
    if (search && !`${item.name} ${item.idName}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (craftability === "craftable" && !item.craftable) return false; if (craftability === "raw" && item.craftable) return false;
    const delta = item.market?.delta.day; if (trend === "up" && !(delta !== null && delta !== undefined && delta > 0)) return false; if (trend === "down" && !(delta !== null && delta !== undefined && delta < 0)) return false; if (trend === "unpriced" && item.market?.price != null) return false;
    if (source !== "all" && !item.lootSources.includes(source)) return false; if (attribute !== "all" && !item.attributes.includes(attribute)) return false;
    if (item.mercantilistLevel !== null && item.mercantilistLevel > Number(mercLevel)) return false; if (watchedOnly && !watched.has(item.idName)) return false;
    return true;
  }), [allItems, search, craftability, trend, source, attribute, mercLevel, watchedOnly, watched]);
  const columns = useMemo(() => [
    column.accessor("name", { header: "Item", cell: ({ row }) => <Link className={styles.itemIdentity} href={`/items/${row.original.idName}`}><span className={styles.itemName}>{row.original.name}</span><span className={styles.itemMeta}>{row.original.idName}</span></Link> }),
    column.accessor((item) => item.market?.price ? BigInt(item.market.price) : null, { id: "price", header: "Lowest price", cell: ({ row }) => <span className={uiStyles.number}>{row.original.market?.price ? <NumberValue value={row.original.market.price} unit="BC" /> : "Unpriced"}</span>, sortingFn: (a, b) => { const x = a.getValue<bigint | null>("price"), y = b.getValue<bigint | null>("price"); return x === y ? 0 : x === null ? -1 : y === null ? 1 : x < y ? -1 : 1; } }),
    column.accessor((item) => item.market?.delta.day ?? null, { id: "trend", header: "24h", cell: ({ getValue }) => { const value = getValue(); return value === null ? <span className="mutedText">—</span> : <span className={value >= 0 ? "positive" : "negative"}>{value >= 0 ? "+" : ""}{value.toFixed(2)}%</span>; } }),
    column.accessor("craftable", { header: "Type", cell: ({ getValue }) => <Badge>{getValue() ? "Craftable" : "Raw / loot"}</Badge> }),
    column.accessor("mercantilistLevel", { header: "Sell unlock", cell: ({ getValue }) => <span className={uiStyles.number}>{getValue() === null ? "—" : `Lv ${getValue()}`}</span> }),
    column.display({ id: "watch", header: "", cell: ({ row }) => <Star className={styles.tableIcon} weight={watched.has(row.original.idName) ? "fill" : "regular"} aria-label={watched.has(row.original.idName) ? "Watched" : "Not watched"} /> }),
  ], [watched]);
  const table = useReactTable({ data: filtered, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 50 } } });
  return <>
    <PageHeader title="Market matrix" description="Every catalog item remains visible, even when the latest market preview omits its price." />
    <div className={styles.toolbar}>
      <Field label="Search"><Input ref={searchRef} data-hotkey-search name="market-search" className={styles.grow} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search item or idName…" /></Field>
      <Field label="Craftability"><NativeSelect value={craftability} onChange={(e) => setCraftability(e.target.value)}><option value="all">All items</option><option value="craftable">Craftable</option><option value="raw">Raw / loot</option></NativeSelect></Field>
      <Field label="Trend"><NativeSelect value={trend} onChange={(e) => setTrend(e.target.value)}><option value="all">Any trend</option><option value="up">Rising</option><option value="down">Falling</option><option value="unpriced">Unpriced</option></NativeSelect></Field>
      <Field label="Loot source"><NativeSelect value={source} onChange={(e) => setSource(e.target.value)}><option value="all">Any source</option>{lootSources.map((value) => <option key={value}>{value}</option>)}</NativeSelect></Field>
      <Field label="Attribute"><NativeSelect value={attribute} onChange={(e) => setAttribute(e.target.value)}><option value="all">Any attribute</option>{attributes.map((value) => <option key={value}>{value}</option>)}</NativeSelect></Field>
      <Field label="Mercantilist"><NativeSelect value={mercLevel} onChange={(e) => setMercLevel(e.target.value)}>{[0,10,20,30,40,50,61].map((value) => <option value={value} key={value}>Up to level {value}</option>)}</NativeSelect></Field>
      <Button variant={watchedOnly ? "primary" : "default"} onClick={() => setWatchedOnly(!watchedOnly)}><Star weight={watchedOnly ? "fill" : "regular"} />Watched</Button>
      <span className={styles.filterCount}>{filtered.length} / {allItems.length}</span>
    </div>
    <Card><CardBody className={uiStyles.tableWrap}>{query.isLoading ? <div className={uiStyles.empty}>Loading catalog…</div> : query.error ? <div className={uiStyles.error}>{query.error.message}</div> : <table className={uiStyles.table}><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{header.isPlaceholder ? null : <button className={styles.sortButton} onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())} {header.column.getIsSorted() === "asc" ? <CaretUp aria-hidden="true" /> : header.column.getIsSorted() === "desc" ? <CaretDown aria-hidden="true" /> : null}</button>}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id}>{row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody></table>}</CardBody></Card>
    <div className={styles.pager}><Button size="small" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><CaretLeft /></Button><span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><Button size="small" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><CaretRight /></Button></div>
  </>;
}
