"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowFatLinesUp, ArrowsClockwise, Pause, Play, ChartLineUp, CirclesThreePlus, Gauge, Gear, Hourglass, ListChecks, ShieldCheck, SlidersHorizontal, Sword, UsersThree } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShortcutGuideButton, ShortcutProvider } from "@/components/shortcuts/ShortcutProvider";
import { Button } from "@/components/ui";
import { OrbVisual } from "@/components/ui/OrbVisual";
import { useAppearance } from "@/components/appearance/AppearanceProvider";
import { readStoredValue, writeStoredValue } from "@/lib/client/storage";
import styles from "./AppShell.module.css";

const navigation = [
  { href: "/", label: "Dashboard", icon: Gauge }, { href: "/market", label: "Market", icon: ChartLineUp }, { href: "/craft", label: "Craft Lab", icon: CirclesThreePlus },
  { href: "/plans", label: "Plans", icon: ListChecks }, { href: "/prestige", label: "Prestige", icon: SlidersHorizontal }, { href: "/players", label: "Players", icon: UsersThree }, { href: "/tracker", label: "Profile tracker", icon: ShieldCheck },
  { href: "/calculators/ascension", label: "Ascension", icon: ArrowFatLinesUp }, { href: "/calculators/boss-damage", label: "Boss damage", icon: Sword }, { href: "/calculators/boosters", label: "Boosters", icon: Hourglass }, { href: "/settings", label: "Settings", icon: Gear },
] as const;

async function getConnection() { const response = await fetch("/api/connection"); return response.json() as Promise<{ connected: boolean; diagnostics: { lastSyncSuccess: string | null } }>; }

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const queryClient = useQueryClient();
  const navRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const appearance = useAppearance();
  useEffect(() => setCollapsed(readStoredValue("ascendry.sidebarCollapsed") === "true"), []);
  useEffect(() => {
    if (!window.matchMedia("(max-width: 560px)").matches) return;
    const frame = window.requestAnimationFrame(() => {
      navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);
  const connection = useQuery({ queryKey: ["connection"], queryFn: getConnection });
  const refresh = useMutation({ mutationFn: async () => { const response = await fetch("/api/sync", { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Refresh failed."); return body; }, onSuccess: () => { void queryClient.invalidateQueries(); } });
  const refreshMarket = useCallback(() => refresh.mutate(), [refresh]);
  const toggle = () => { const next = !collapsed; setCollapsed(next); setStorageWarning(writeStoredValue("ascendry.sidebarCollapsed", String(next)) ? null : "Sidebar preference changed for this tab but could not be saved. Browser storage is unavailable."); };
  return <ShortcutProvider onRefresh={refreshMarket} refreshDisabled={!connection.data?.connected || refresh.isPending}><div className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}>
    <a className="skipLink" href="#main-content">Skip to content</a>
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <Link href="/" className={styles.brand} aria-label="Ascendry dashboard"><OrbVisual size={34} animated={false} /><span className={`${styles.brandCopy} ${styles.brandName}`}>Ascendry<span className={styles.brandMeta}>Market bench</span></span></Link>
      <nav ref={navRef} className={styles.nav} aria-label="Main navigation">{[
        { label: "Workspace", links: navigation.slice(0, 4) },
        { label: "Progression", links: navigation.slice(4, 7) },
        { label: "Calculators", links: navigation.slice(7, 10) },
        { label: "System", links: navigation.slice(10) },
      ].map((group) => <div className={styles.navGroup} key={group.label}><span className={styles.navLabel}>{group.label}</span>{group.links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return <Link key={href} href={href as never} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined} className={`${styles.navLink} ${active ? styles.navActive : ""}`}><Icon className={styles.navIcon} weight={active ? "fill" : "regular"} /><span className={styles.navText}>{label}</span></Link>;
      })}</div>)}</nav>
      <div className={styles.sidebarFooter}><Button aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={styles.collapse} variant="quiet" size="small" onClick={toggle}><svg className={styles.collapseIcon} aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-icon="tabler:chevrons-left"><g className={styles.collapseIconGroup} style={{ transform: collapsed ? "rotate(180deg)" : undefined }}><path d="m11 7-5 5 5 5" /><path d="m17 7-5 5 5 5" /></g></svg><span className={styles.navText}>Collapse</span></Button></div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.status} aria-live="polite"><span className={`${styles.dot} ${connection.data?.connected ? styles.dotConnected : ""}`} /><span className={styles.statusCopy}>{connection.data?.connected ? `Connected · ${connection.data.diagnostics.lastSyncSuccess ? new Date(connection.data.diagnostics.lastSyncSuccess).toLocaleString() : "catalog ready"}` : "Local catalog · API not connected"}</span></div>
        <div className={styles.topActions}><Button size="icon" variant="quiet" className={styles.motionToggle} aria-label={appearance.orbMotion ? "Pause orb animation" : "Resume orb animation"} title={appearance.orbMotion ? "Pause orb animation" : "Resume orb animation"} aria-pressed={!appearance.orbMotion} onClick={() => appearance.setOrbMotion(!appearance.orbMotion)}>{appearance.orbMotion ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</Button><ShortcutGuideButton /><Button size="small" aria-keyshortcuts="Shift+R" title="Refresh market (Shift+R)" disabled={!connection.data?.connected || refresh.isPending} onClick={refreshMarket}><ArrowsClockwise className={refresh.isPending ? "spin" : ""} />{refresh.isPending ? "Refreshing…" : "Refresh market"}</Button></div>
      </header>
      <main id="main-content" className={styles.content}>{(storageWarning || appearance.storageWarning) && <p role="alert">{storageWarning || appearance.storageWarning}</p>}{refresh.error && <p role="alert" style={{ color: "var(--negative)", fontSize: ".8rem" }}>{refresh.error.message}</p>}{children}</main>
    </div>
  </div></ShortcutProvider>;
}

export function PageHeader({ title, description, action }: { title: string; description: React.ReactNode; action?: React.ReactNode }) {
  return <header className={styles.pageHeader}><div className={styles.pageIdentity}><OrbVisual size={54} /><div><h1 className={styles.pageTitle}>{title}</h1><p className={styles.pageDescription}>{description}</p></div></div>{action}</header>;
}
