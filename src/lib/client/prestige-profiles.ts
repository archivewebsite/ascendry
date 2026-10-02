"use client";

import { useCallback, useEffect, useState } from "react";
import { PRESTIGE_PERKS, validatePrestigeLevels } from "@/lib/prestige";
import type { PrestigeProfileSnapshot } from "@/lib/types";
import { profileSchema } from "@/lib/plan-schema";

const STORAGE_KEY = "ascendry.prestigeProfiles";
export const EMPTY_LEVELS = Object.fromEntries(PRESTIGE_PERKS.map((perk) => [perk.key, 0]));
const defaultProfile = (): PrestigeProfileSnapshot & { id: string } => ({ id: "main", name: "Main profile", levels: { ...EMPTY_LEVELS } });

export function normalizeStoredProfiles(value: unknown): Array<PrestigeProfileSnapshot & { id: string }> {
  if (!Array.isArray(value) || value.length === 0) return [defaultProfile()];
  const profiles: Array<PrestigeProfileSnapshot & { id: string }> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const parsed = profileSchema.safeParse(entry);
    if (!parsed.success || !parsed.data.id || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    profiles.push({ ...parsed.data, id: parsed.data.id, levels: { ...EMPTY_LEVELS, ...parsed.data.levels } });
    if (profiles.length === 3) break;
  }
  return profiles.length ? profiles : [defaultProfile()];
}

export function usePrestigeProfiles() {
  const [profiles, setProfiles] = useState<Array<PrestigeProfileSnapshot & { id: string }>>([defaultProfile()]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
      setProfiles(normalizeStoredProfiles(parsed));
    } catch { /* use the safe default */ }
    setReady(true);
  }, []);
  const persist = useCallback((next: Array<PrestigeProfileSnapshot & { id: string }>) => {
    setProfiles(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error("Changes are available in this tab but could not be saved. Browser storage is unavailable."); }
    window.dispatchEvent(new Event("ascendry:profiles"));
  }, []);
  const update = (profile: PrestigeProfileSnapshot & { id: string }) => {
    if (!profiles.some((entry) => entry.id === profile.id)) throw new Error("The selected profile no longer exists.");
    if (!profile.name.trim()) throw new Error("Enter a profile name before saving.");
    validatePrestigeLevels(profile.levels);
    const validated = profileSchema.parse(profile);
    persist(profiles.map((entry) => entry.id === profile.id ? { ...validated, id: profile.id } : entry));
  };
  const create = (name: string) => { if (profiles.length >= 3) throw new Error("Ascendry supports up to three local Prestige profiles."); if (!name.trim()) throw new Error("Enter a profile name."); const profile = { id: crypto.randomUUID(), name: name.trim(), levels: { ...EMPTY_LEVELS } }; persist([...profiles, profile]); return profile; };
  const remove = (id: string) => { if (!profiles.some((entry) => entry.id === id)) throw new Error("The selected profile no longer exists."); if (profiles.length === 1) throw new Error("Keep at least one Prestige profile."); persist(profiles.filter((entry) => entry.id !== id)); };
  return { profiles, ready, update, create, remove };
}
