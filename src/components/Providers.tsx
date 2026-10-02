"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { IconContext } from "@phosphor-icons/react";
import { useState } from "react";
import { AppearanceProvider } from "@/components/appearance/AppearanceProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={client}><Tooltip.Provider delayDuration={350}><IconContext.Provider value={{ "aria-hidden": true }}><AppearanceProvider>{children}</AppearanceProvider></IconContext.Provider></Tooltip.Provider></QueryClientProvider>;
}
