import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerExplorer } from "@/components/players/PlayerExplorer";

export const metadata: Metadata = { title: "Player Explorer" };

export default function PlayersPage() {
  return <Suspense fallback={<div>Loading Player Explorer…</div>}><PlayerExplorer /></Suspense>;
}
