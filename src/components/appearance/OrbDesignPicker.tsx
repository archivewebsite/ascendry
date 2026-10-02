"use client";

import { Check } from "@phosphor-icons/react";
import { useAppearance } from "./AppearanceProvider";
import { OrbVisual } from "@/components/ui/OrbVisual";
import { ORB_DESIGNS } from "@/lib/orb-designs";
import styles from "./OrbDesignPicker.module.css";

export function OrbDesignPicker() {
  const { orbDesign, setOrbDesign, orbMotion, setOrbMotion } = useAppearance();
  return <fieldset className={styles.picker}>
    <legend className="srOnly">Orb design</legend>
    <div className={styles.choices}>{ORB_DESIGNS.map((design) =>
      <button type="button" key={design.key} className={styles.choice}
        aria-label={`Use ${design.name} orb design`} aria-pressed={orbDesign === design.key}
        onClick={() => setOrbDesign(design.key)}>
        {orbDesign === design.key && <Check className={styles.selected} aria-hidden="true" weight="bold" />}
        <OrbVisual design={design.key} size={94} />
        <strong>{design.name}</strong><span>{design.description}</span>
      </button>
    )}</div>
    <label className={styles.motion}><input type="checkbox" name="orb-motion" checked={orbMotion} onChange={(event) => setOrbMotion(event.target.checked)} />
      <span><strong>Animate orbs</strong><span>Ambient motion on the dashboard. Reduced-motion preferences always apply.</span></span>
    </label>
    <p className={styles.help}>Your design follows you across the workspace and takes its color from the electrical palette.</p>
  </fieldset>;
}

export function OrbSizeShowcase() {
  return <div className={styles.sizes}>{[{ size: 34, label: "Navigation" }, { size: 54, label: "Page headers" }, { size: 156, label: "Dashboard" }].map(({ size, label }) =>
    <div key={size}><OrbVisual size={size} /><span>{label}</span></div>
  )}</div>;
}
