import type { Metadata } from "next";
import { PlansWorkspace } from "@/components/plans/PlansWorkspace";
export const metadata: Metadata = { title: "Plans" };
export default function Page() { return <PlansWorkspace />; }
