"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME_KEY, themeStyle, type AppearanceMode, type ResolvedMode } from "@/lib/themes";
import { readStoredValue, writeStoredValue } from "@/lib/client/storage";
import { DEFAULT_ORB_DESIGN, isOrbDesign, type OrbDesign } from "@/lib/orb-designs";
import { isNumberDisplayFormat, type NumberDisplayFormat } from "@/lib/quantity";

interface AppearanceContextValue {
  mode: AppearanceMode;
  resolvedMode: ResolvedMode;
  paletteKey: string;
  setMode: (mode: AppearanceMode) => void;
  setPaletteKey: (key: string) => void;
  storageWarning: string | null;
  orbDesign: OrbDesign;
  setOrbDesign: (design: OrbDesign) => void;
  orbMotion: boolean;
  setOrbMotion: (enabled: boolean) => void;
  numberFormat: NumberDisplayFormat;
  setNumberFormat: (format: NumberDisplayFormat) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppearanceMode>("adaptive");
  const [paletteKey, setPaletteState] = useState(DEFAULT_THEME_KEY);
  const [systemDark, setSystemDark] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [orbDesign, setOrbDesignState] = useState<OrbDesign>(DEFAULT_ORB_DESIGN);
  const [orbMotion, setOrbMotionState] = useState(true);
  const [numberFormat, setNumberFormatState] = useState<NumberDisplayFormat>("compact");
  useEffect(() => {
    const storedMode = readStoredValue("ascendry.appearance") as AppearanceMode | null;
    const storedPalette = readStoredValue("ascendry.palette");
    const storedOrb = readStoredValue("ascendry.orbDesign");
    if (isOrbDesign(storedOrb)) setOrbDesignState(storedOrb);
    setOrbMotionState(readStoredValue("ascendry.orbMotion") !== "false");
    const storedNumberFormat = readStoredValue("ascendry.numberFormat");
    if (isNumberDisplayFormat(storedNumberFormat)) setNumberFormatState(storedNumberFormat);
    if (storedMode && ["adaptive", "light", "dark"].includes(storedMode)) setModeState(storedMode);
    if (storedPalette) setPaletteState(storedPalette);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const resolvedMode: ResolvedMode = mode === "adaptive" ? (systemDark ? "dark" : "light") : mode;
  useEffect(() => {
    const root = document.documentElement;
    const resolvedTheme = themeStyle(paletteKey, resolvedMode);
    for (const [key, value] of Object.entries(resolvedTheme)) root.style.setProperty(key, value);
    root.style.colorScheme = resolvedMode;
    root.dataset.theme = paletteKey; root.dataset.mode = resolvedMode;
    const background = resolvedTheme["--background"];
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
  }, [paletteKey, resolvedMode]);
  const value = useMemo(() => ({
    mode, resolvedMode, paletteKey, storageWarning, orbDesign, orbMotion, numberFormat,
    setNumberFormat: (next: NumberDisplayFormat) => { setNumberFormatState(next); setStorageWarning(writeStoredValue("ascendry.numberFormat", next) ? null : "Number format changed for this tab but could not be saved. Browser storage is unavailable."); },
    setOrbDesign: (next: OrbDesign) => { setOrbDesignState(next); setStorageWarning(writeStoredValue("ascendry.orbDesign", next) ? null : "Orb design changed for this tab but could not be saved. Browser storage is unavailable."); },
    setOrbMotion: (next: boolean) => { setOrbMotionState(next); setStorageWarning(writeStoredValue("ascendry.orbMotion", String(next)) ? null : "Orb motion changed for this tab but could not be saved. Browser storage is unavailable."); },
    setMode: (next: AppearanceMode) => { setModeState(next); setStorageWarning(writeStoredValue("ascendry.appearance", next) ? null : "Appearance changed for this tab but could not be saved. Browser storage is unavailable."); },
    setPaletteKey: (next: string) => { setPaletteState(next); setStorageWarning(writeStoredValue("ascendry.palette", next) ? null : "Appearance changed for this tab but could not be saved. Browser storage is unavailable."); },
  }), [mode, resolvedMode, paletteKey, storageWarning, orbDesign, orbMotion, numberFormat]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() { const value = useContext(AppearanceContext); if (!value) throw new Error("AppearanceProvider is missing."); return value; }
