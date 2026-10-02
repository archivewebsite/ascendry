"use client";

import { useMemo, type CSSProperties } from "react";
import { useAppearance } from "@/components/appearance/AppearanceProvider";
import { buildThemeTokens, THEME_PALETTES } from "@/lib/themes";
import type { OrbDesign } from "@/lib/orb-designs";
import { cn } from "@/lib/utils";
import FluidOrb from "./fluid-orb";
import styles from "./OrbVisual.module.css";

export function OrbVisual({ design, size = 100, animated = false, className }: {
  design?: OrbDesign; size?: number; animated?: boolean; className?: string;
}) {
  const appearance = useAppearance();
  const selected = design ?? appearance.orbDesign;
  const color = useMemo(() => {
    const palette = THEME_PALETTES.find((entry) => entry.key === appearance.paletteKey) ?? THEME_PALETTES[0]!;
    return buildThemeTokens(palette, appearance.resolvedMode).primary;
  }, [appearance.paletteKey, appearance.resolvedMode]);
  const moving = animated && appearance.orbMotion;
  const visualSize = Number.isFinite(size) && size > 0 ? size : 100;

  return <div aria-hidden="true" data-orb-design={selected} data-orb-moving={moving}
    className={cn(styles.visual, styles[selected], className)}
    style={{ "--orb-size": `${visualSize}px`, "--orb-color": color, "--orb-core-width": selected === "liquid" ? "86%" : "64%" } as CSSProperties}>
    <div className={styles.core}><FluidOrb size={Math.round(visualSize * (selected === "liquid" ? .86 : .64))} color={color} animated={moving} style={{ width: "100%", height: "100%" }} /></div>
    <svg className={styles.instrument} viewBox="0 0 100 100" fill="none" focusable="false">
      {selected === "halo" && <>
        <circle cx="50" cy="50" r="46" className={styles.outerRing} />
        <circle cx="50" cy="50" r="39" className={styles.innerRing} />
        <path d="M50 1v5M50 94v5M1 50h5M94 50h5" className={styles.ticks} />
        <path d="m17.5 17.5 3 3m59 59 3 3m-65 0 3-3m59-59 3-3" className={styles.ticks} />
        <path d="M13 50a37 37 0 0 1 37-37" className={styles.signalArc} />
        <circle cx="50" cy="13" r="2" className={styles.node} />
      </>}
      {selected === "eclipse" && <circle cx="50" cy="50" r="44" className={styles.outerRing} />}
      {selected === "orbit" && <>
        <ellipse cx="50" cy="50" rx="47" ry="22" transform="rotate(-28 50 50)" className={styles.orbitLine} />
        <ellipse cx="50" cy="50" rx="39" ry="44" transform="rotate(24 50 50)" className={styles.outerRing} />
        <circle cx="8.5" cy="72" r="3.3" className={styles.node} />
      </>}
    </svg>
    {selected === "eclipse" && <span className={styles.occluder} />}
  </div>;
}
