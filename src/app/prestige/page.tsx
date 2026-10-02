import type { Metadata } from "next";
import { PrestigeProfiles } from "@/components/prestige/PrestigeProfiles";
export const metadata: Metadata = { title: "Prestige" };
export default function Page() { return <PrestigeProfiles />; }
