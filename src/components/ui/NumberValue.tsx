"use client";

import React, { useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useAppearance } from "@/components/appearance/AppearanceProvider";
import { formatDisplayInteger, formatInteger } from "@/lib/quantity";
import styles from "./NumberValue.module.css";

/** Display only: the original integer is used for exact inspection and exports. */
export function NumberValue({ value, unit, interactive = true }: { value: string | bigint; unit?: string; interactive?: boolean }) {
  const { numberFormat } = useAppearance();
  const [open, setOpen] = useState(false);
  const displayed = formatDisplayInteger(value, numberFormat);
  const exact = formatInteger(value);
  const label = `${displayed}${unit ? ` ${unit}` : ""}`;
  const exactLabel = `${exact}${unit ? ` ${unit}` : ""}`;
  if (displayed === exact || !interactive) return <span className={styles.value} title={exactLabel} aria-label={exactLabel}>{displayed === exact ? label.split(",").map((group, index, groups) => <React.Fragment key={index}>{group}{index < groups.length - 1 && <>,<wbr /></>}</React.Fragment>) : label}</span>;
  return <Tooltip.Provider delayDuration={200}><Tooltip.Root open={open} onOpenChange={setOpen}>
    <Tooltip.Trigger asChild><button type="button" className={styles.trigger} aria-label={`${label}. Show exact value`} onClick={(event) => {
      // Radix closes on click by default; keep exact values open for touch.
      event.preventDefault();
      setOpen(true);
    }}>{label}</button></Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content className={styles.exact} sideOffset={8} collisionPadding={12}>
      <span className={styles.caption}>Exact value</span>
      <span className={styles.digits}>{exactLabel}</span>
      <Tooltip.Arrow className={styles.arrow} />
    </Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root></Tooltip.Provider>;
}
