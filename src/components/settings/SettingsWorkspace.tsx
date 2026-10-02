"use client";

import Link from "next/link";
import { DownloadSimple, Plug, Trash, UploadSimple } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { useAppearance } from "@/components/appearance/AppearanceProvider";
import { NumberValue } from "@/components/ui/NumberValue";
import { NUMBER_SCALES, type NumberDisplayFormat } from "@/lib/quantity";
import { OrbDesignPicker } from "@/components/appearance/OrbDesignPicker";
import { Badge, Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, NativeSelect, Notice, uiStyles } from "@/components/ui";
import { THEME_PALETTES, type AppearanceMode } from "@/lib/themes";
import { assertResponseOk } from "@/lib/client/http";
import styles from "@/app/pages.module.css";

interface Connection { connected: boolean; credentialError?: string; diagnostics: { items: number; recipes: number; market_snapshots: number; plans: number; alerts: number; lastSyncSuccess: string | null; lastSyncError: string | null; catalogSource: string | null } }
async function connection(): Promise<Connection> { const response = await fetch("/api/connection"); return response.json(); }

export function SettingsWorkspace() {
  const client = useQueryClient(); const status = useQuery({ queryKey: ["connection"], queryFn: connection }); const [apiKey, setApiKey] = useState(""); const { mode, setMode, paletteKey, setPaletteKey, numberFormat, setNumberFormat } = useAppearance(); const fileRef = useRef<HTMLInputElement>(null);
  const connect = useMutation({ mutationFn: async () => { const response = await fetch("/api/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Connection failed."); return body; }, onSuccess: () => { setApiKey(""); void client.invalidateQueries(); } });
  const disconnect = useMutation({ mutationFn: async () => { const response = await fetch("/api/connection", { method: "DELETE" }); await assertResponseOk(response, "The connection could not be removed."); }, onSuccess: () => void client.invalidateQueries() });
  const removeConnection = () => { if (window.confirm("Disconnect Bconomy and remove the protected local credential?")) disconnect.mutate(); };
  const importBackup = useMutation({ mutationFn: async (file: File) => { if (!window.confirm("Import this backup? Plans, alerts, and matching market snapshots may be replaced.")) return; const response = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() }); await assertResponseOk(response, "Backup import failed. Verify that this is an Ascendry JSON backup."); }, onSuccess: () => void client.invalidateQueries() });
  const deleteHistory = useMutation({ mutationFn: async () => { if (!window.confirm("Remove all retained market history and external caches? Saved plans and alerts will remain.")) return; const response = await fetch("/api/history", { method: "DELETE" }); await assertResponseOk(response, "History could not be removed."); }, onSuccess: () => void client.invalidateQueries() });
  const diagnostic = status.data?.diagnostics;
  return <>
    <PageHeader title="Settings" description="Connection, appearance, local persistence, and diagnostic controls." />
    <Notice>Craft Lab uses normal Market prices. The Profile tracker handles Ironman and Hardcore inventory and accepts manual Depot price and stock quotes.</Notice>
    <div className={`${styles.grid} ${styles.twoColumns} ${styles.sectionGap}`}>
      <div className={styles.stack}>
        <Card><CardHeader title="Orb design" description="Four expressions of the same liquid core" /><CardBody><OrbDesignPicker /></CardBody></Card>
        <Card><CardHeader title="Bconomy connection" description="The key is encrypted for this Windows user and never returned to the browser" action={<Badge tone={status.data?.connected ? "positive" : "warning"}>{status.data?.connected ? "Connected" : "Not connected"}</Badge>} /><CardBody><div className={styles.stack}>{status.data?.credentialError && <ErrorMessage>{status.data.credentialError}</ErrorMessage>}<Field label="API key" help="Connecting validates the key and performs the initial catalog and market sync."><Input name="api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status.data?.connected ? "Enter a replacement key…" : "Paste API key…"} /></Field>{connect.error && <ErrorMessage>{connect.error.message}</ErrorMessage>}{disconnect.error && <ErrorMessage>{disconnect.error.message}</ErrorMessage>}<div className={styles.actions}><Button variant="primary" disabled={!apiKey || connect.isPending} onClick={() => connect.mutate()}><Plug />{connect.isPending ? "Validating…" : status.data?.connected ? "Replace connection" : "Connect and sync"}</Button>{status.data?.connected && <Button variant="danger" disabled={disconnect.isPending} onClick={removeConnection}>Disconnect</Button>}</div></div></CardBody></Card>
        <Card><CardHeader title="Appearance" description="Palette and resolved display mode are independent" /><CardBody><div className={styles.stack}><Field label="Display mode"><NativeSelect value={mode} onChange={(e) => setMode(e.target.value as AppearanceMode)}><option value="adaptive">Adaptive / system</option><option value="light">Light</option><option value="dark">Dark</option></NativeSelect></Field><Field label="Electrical palette"><NativeSelect value={paletteKey} onChange={(e) => setPaletteKey(e.target.value)}>{(["Bench", "Signal", "Power"] as const).map((group) => <optgroup label={group} key={group}>{THEME_PALETTES.filter((palette) => palette.group === group).map((palette) => <option value={palette.key} key={palette.key}>{palette.name}</option>)}</optgroup>)}</NativeSelect></Field><div className={styles.chipRow}>{THEME_PALETTES.find((palette) => palette.key === paletteKey)?.colors.map((color) => <span key={color} title={color} aria-label={color} style={{ width: 34, height: 34, display: "inline-block", borderRadius: 7, background: color, border: "1px solid var(--border)" }} />)}</div></div></CardBody></Card>
      </div>
      <div className={styles.stack}>
        <Card><CardHeader title="Number display" description="Shorten large amounts and keep every digit available" /><CardBody><div className={styles.stack}>
          <Field label="Number format"><NativeSelect name="number-format" aria-label="Number format" value={numberFormat} onChange={(event) => setNumberFormat(event.target.value as NumberDisplayFormat)}>
            <option value="compact">Short suffixes · 120.1t</option><option value="words">Full names · 120.1 trillion</option><option value="exact">Exact · 120,098,942,437,500</option>
          </NativeSelect></Field>
          <p className={styles.numberExample}><NumberValue value="120098942437500" unit="BC" /></p>
          <p className="mutedText">Shortened values are rounded. Hover, focus, or tap a dotted value to see the exact amount. This preference applies to Craft Lab, market prices, item details, and saved plans. Calculations and exports keep their exact values.</p>
          <details><summary>Supported suffixes and inputs</summary><p className="mutedText">{NUMBER_SCALES.map(scale => `${scale.suffix} = ${scale.name}`).join("; ")}. Larger values use scientific notation.</p><p className="mutedText">Quantity, budget, and Craft Lab price inputs accept short suffixes or full names, such as 2.5m and 2.5 million.</p></details>
        </div></CardBody></Card>
        <Card><CardHeader title="Local data" description="Backups exclude the protected API credential" /><CardBody><div className={styles.stack}><div className={styles.actions}><a className={uiStyles.button} href="/api/backup" download><DownloadSimple />Export backup</a><Button disabled={importBackup.isPending} onClick={() => fileRef.current?.click()}><UploadSimple />Import backup</Button><input ref={fileRef} aria-label="Choose backup file" name="backup-file" hidden type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) importBackup.mutate(file); }} /><Button variant="danger" disabled={deleteHistory.isPending} onClick={() => deleteHistory.mutate()}><Trash />Remove history</Button></div>{importBackup.error && <ErrorMessage>{importBackup.error.message}</ErrorMessage>}{deleteHistory.error && <ErrorMessage>{deleteHistory.error.message}</ErrorMessage>}<p className="mutedText">Unique manual snapshots are retained indefinitely until removed here. No background polling or OS notifications run.</p></div></CardBody></Card>
        <Card><CardHeader title="Diagnostics" description="Last-good state remains available after failed syncs" action={<Link href="/design-guide"><Badge>Design system</Badge></Link>} /><CardBody><div className={styles.dividerRows}>{diagnostic ? Object.entries({ Items: diagnostic.items, "Recipe lines": diagnostic.recipes, Snapshots: diagnostic.market_snapshots, Plans: diagnostic.plans, Alerts: diagnostic.alerts, "Last refresh": diagnostic.lastSyncSuccess ? new Date(diagnostic.lastSyncSuccess).toLocaleString() : "Never", "Last error": diagnostic.lastSyncError ?? "None", "Catalog source": diagnostic.catalogSource ?? "Live" }).map(([label, value]) => <div className={`${styles.row} ${styles.listRow}`} key={label}><span className="mutedText">{label}</span><span className="mono">{value}</span></div>) : <div>Loading diagnostics…</div>}</div></CardBody></Card>
      </div>
    </div>
  </>;
}
