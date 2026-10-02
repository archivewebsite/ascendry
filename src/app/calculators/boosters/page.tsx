import type { Metadata } from "next";
import { BoosterCalculator } from "@/components/calculators/BoosterCalculator";

export const metadata: Metadata = { title: "Booster Calculator" };

export default function BoosterCalculatorPage() { return <BoosterCalculator />; }
