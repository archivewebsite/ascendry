import type { Metadata } from "next";
import { Suspense } from "react";
import { BossDamageCalculator } from "@/components/calculators/BossDamageCalculator";

export const metadata: Metadata = { title: "Boss Damage Calculator" };

export default function BossDamageCalculatorPage() {
  return <Suspense fallback={<div>Loading Boss Damage Calculator…</div>}><BossDamageCalculator /></Suspense>;
}
