import type { Metadata } from "next";
import { ItemDetail } from "@/components/items/ItemDetail";
export const metadata: Metadata = { title: "Item details" };
export default async function Page({ params }: { params: Promise<{ idName: string }> }) { const { idName } = await params; return <ItemDetail idName={idName} />; }
