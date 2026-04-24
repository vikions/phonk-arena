"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";

import { ArenaAudioProvider } from "@/components/ArenaAudioProvider";
import {
  DEFAULT_ARENA_NETWORK_ID,
  type ArenaNetworkConfig,
  type ArenaNetworkId,
  getArenaNetworkConfig,
  getArenaNetworkId,
} from "@/lib/arenaNetworks";
import { wagmiConfig } from "@/lib/wagmi";

interface ProvidersProps {
  children: React.ReactNode;
}

interface ArenaNetworkContextValue {
  selectedArenaNetworkId: ArenaNetworkId;
  selectedArenaNetwork: ArenaNetworkConfig;
  setSelectedArenaNetworkId: (networkId: ArenaNetworkId) => void;
}

const ArenaNetworkContext = createContext<ArenaNetworkContextValue>({
  selectedArenaNetworkId: DEFAULT_ARENA_NETWORK_ID,
  selectedArenaNetwork: getArenaNetworkConfig(DEFAULT_ARENA_NETWORK_ID),
  setSelectedArenaNetworkId: () => undefined,
});

export function useArenaNetwork() {
  return useContext(ArenaNetworkContext);
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
  const [selectedArenaNetworkId, setSelectedArenaNetworkIdState] =
    useState<ArenaNetworkId>(DEFAULT_ARENA_NETWORK_ID);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setSelectedArenaNetworkIdState(getArenaNetworkId(window.localStorage.getItem("phonk-arena-network")));
  }, []);

  const setSelectedArenaNetworkId = useCallback((networkId: ArenaNetworkId) => {
    setSelectedArenaNetworkIdState(networkId);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("phonk-arena-network", networkId);
    }
  }, []);

  const arenaNetworkContext = useMemo(
    () => ({
      selectedArenaNetworkId,
      selectedArenaNetwork: getArenaNetworkConfig(selectedArenaNetworkId),
      setSelectedArenaNetworkId,
    }),
    [selectedArenaNetworkId, setSelectedArenaNetworkId],
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ArenaNetworkContext.Provider value={arenaNetworkContext}>
          <ArenaAudioProvider>{children}</ArenaAudioProvider>
        </ArenaNetworkContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
