import type { Metadata } from "next";
import { Suspense } from "react";
import { CraftLab } from "@/components/craft/CraftLab";
export const metadata: Metadata = { title: "Craft Lab" };
export default function Page() { return <Suspense fallback={<div>Loading Craft Lab…</div>}><CraftLab /></Suspense>; }
