import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: { default: "Ascendry", template: "%s · Ascendry" }, description: "Local Bconomy market intelligence and crafting workspace" };
export const viewport: Viewport = { themeColor: "#f8f8f8" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><Providers><AppShell>{children}</AppShell></Providers></body></html>;
}
