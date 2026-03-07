"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";

import { ArenaAudioProvider } from "@/components/ArenaAudioProvider";
import { wagmiConfig } from "@/lib/wagmi";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ArenaAudioProvider>{children}</ArenaAudioProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
