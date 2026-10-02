import type { Metadata } from "next";
import { RestrictedTracker } from "@/components/tracker/RestrictedTracker";

export const metadata: Metadata = { title: "Restricted profile tracker" };

export default function TrackerPage() { return <RestrictedTracker />; }
