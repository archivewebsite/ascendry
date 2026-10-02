import type { Metadata } from "next";
import { Suspense } from "react";
import { AscensionCalculator } from "@/components/calculators/AscensionCalculator";

export const metadata: Metadata = { title: "Ascension Calculator" };

export default function AscensionCalculatorPage() {
  return <Suspense fallback={<div>Loading Ascension Calculator…</div>}><AscensionCalculator /></Suspense>;
}
