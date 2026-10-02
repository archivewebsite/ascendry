import type { Metadata } from "next";
import { MarketTable } from "@/components/market/MarketTable";
export const metadata: Metadata = { title: "Market" };
export default function Page() { return <MarketTable />; }
