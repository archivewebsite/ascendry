"use client";

import { FloppyDisk, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/AppShell";
import { Badge, Button, Card, CardBody, CardHeader, ErrorMessage, Field, Input, Notice } from "@/components/ui";
import { usePrestigeProfiles } from "@/lib/client/prestige-profiles";
import { PRESTIGE_PERKS, TOTAL_MAX_PRESTIGE_LEVELS } from "@/lib/prestige";
import type { PrestigeProfileSnapshot } from "@/lib/types";
import shared from "@/app/pages.module.css";
import styles from "./PrestigeProfiles.module.css";

export function PrestigeProfiles() {
  const { profiles, update, create, remove } = usePrestigeProfiles(); const [selectedId, setSelectedId] = useState("main"); const [draft, setDraft] = useState<PrestigeProfileSnapshot & { id: string }>(profiles[0]!); const [newName, setNewName] = useState(""); const [message, setMessage] = useState<string | null>(null);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? profiles[0]!;
  useEffect(() => setDraft(structuredClone(selected)), [selected]);
  const total = useMemo(() => Object.values(draft.levels).reduce((sum, level) => sum + level, 0), [draft]);
  const makeProfile = () => { try { const profile = create(newName.trim() || `Profile ${profiles.length + 1}`); setSelectedId(profile.id); setNewName(""); setMessage(null); } catch (error) { setMessage((error as Error).message); } };
  const save = () => { try { update(draft); setMessage("Profile saved locally."); } catch (error) { setMessage((error as Error).message); } };
  return <>
    <PageHeader title="Prestige profiles" description="Maintain up to three local builds. Plans capture a full snapshot, so later perk changes never rewrite old results." />
    <Notice>Craft Lab models the normal Market. Use the Profile tracker for Ironman and Hardcore inventory-aware crafting and manual Depot quotes.</Notice>
    <div className={`${styles.layout} ${shared.sectionGap}`}>
      <Card><CardHeader title="Profiles" description={`${profiles.length} of 3 used`} /><CardBody><div className={styles.profileList}>{profiles.map((profile) => <button key={profile.id} onClick={() => setSelectedId(profile.id)} className={`${styles.profileButton} ${selectedId === profile.id ? styles.selected : ""}`}><span>{profile.name}</span><span className="mono">{Object.values(profile.levels).reduce((sum, level) => sum + level, 0)}</span></button>)}</div>{profiles.length < 3 && <div className={styles.profileActions}><Input name="new-profile-name" aria-label="New profile name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Trading…" /><Button size="icon" aria-label="Create profile" onClick={makeProfile}><Plus /></Button></div>}</CardBody></Card>
      <Card><CardHeader title={draft.name} description={`${total} assigned levels · no Rune-budget validation`} action={<Badge>{TOTAL_MAX_PRESTIGE_LEVELS} all-perk maximum</Badge>} /><CardBody><div className={shared.stack}><Field label="Profile name"><Input name="profile-name" autoComplete="off" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field><div className={styles.perkGrid}>{PRESTIGE_PERKS.map((perk) => {
        const descriptionId = `${perk.key}-description`;
        const effectId = `${perk.key}-effect`;
        const inputId = `${perk.key}-level`;
        return <section className={`${styles.perk} ${perk.calculationRelevant ? styles.relevant : ""}`} key={perk.key} aria-labelledby={`${perk.key}-name`}>
          <div className={styles.perkCopy}>
            <div className={styles.perkHeader}>
              <span className={styles.perkIcon} aria-hidden="true">{perk.icon}</span>
              <h3 className={styles.perkName} id={`${perk.key}-name`}>{perk.name}</h3>
              {perk.calculationRelevant && <Badge>Active in v1</Badge>}
            </div>
            <p className={styles.perkDescription} id={descriptionId}>{perk.description}</p>
            <p className={styles.perkEffect} id={effectId}><span>Effect</span><strong>{perk.effect}</strong></p>
          </div>
          <label className={styles.levelField} htmlFor={inputId}>
            <span className={styles.levelLabel}>Level</span>
            <Input id={inputId} name={inputId} autoComplete="off" aria-label={`${perk.name} level`} aria-describedby={`${descriptionId} ${effectId}`} type="number" inputMode="numeric" min={0} max={perk.maxLevel} step={1} value={draft.levels[perk.key] ?? 0} onChange={(e) => setDraft({ ...draft, levels: { ...draft.levels, [perk.key]: Math.max(0, Math.min(perk.maxLevel, Number(e.target.value))) } })} />
            <span className={styles.levelMaximum}>Max {perk.maxLevel}</span>
          </label>
        </section>;
      })}</div>{message && (message === "Profile saved locally." ? <Notice>{message}</Notice> : <ErrorMessage>{message}</ErrorMessage>)}<div className={styles.profileActions}><Button variant="primary" onClick={save}><FloppyDisk />Save profile</Button><Button variant="danger" disabled={profiles.length === 1} onClick={() => { if (window.confirm(`Delete ${selected.name}?`)) { try { remove(selected.id); setSelectedId(profiles.find((entry) => entry.id !== selected.id)?.id ?? "main"); setMessage(null); } catch (cause) { setMessage((cause as Error).message); } } }}><Trash />Delete profile</Button></div></div></CardBody></Card>
    </div>
  </>;
}
