"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useState } from "react";
import { registerClientCacheCleaner } from "@/lib/client/runtime-resources";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  useEffect(
    () => registerClientCacheCleaner(() => queryClient.clear()),
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={450}>{children}</Tooltip.Provider>
    </QueryClientProvider>
  );
}
