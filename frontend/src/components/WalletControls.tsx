"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useWalletClient,
  useSwitchChain,
} from "wagmi";

import { useArenaNetwork } from "@/components/Providers";
import { trackOncePerSession } from "@/lib/analytics";
import { ARENA_NETWORK_IDS, arenaNetworks } from "@/lib/arenaNetworks";
import { ensureArenaNetwork, readWalletChainId } from "@/lib/walletNetwork";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function NetworkSelector() {
  const { selectedArenaNetworkId, setSelectedArenaNetworkId } = useArenaNetwork();

  return (
    <div className="flex items-center gap-1 rounded-[4px] border border-white/10 bg-white/[0.03] p-1">
      {ARENA_NETWORK_IDS.map((networkId) => {
        const selected = selectedArenaNetworkId === networkId;
        const network = arenaNetworks[networkId];

        return (
          <button
            key={networkId}
            type="button"
            aria-pressed={selected}
            className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
              selected
                ? "border-[var(--ghost)] bg-[color-mix(in_srgb,var(--ghost)_22%,transparent)] text-[var(--ghost)] shadow-[0_0_18px_rgba(56,189,248,0.24)]"
                : "border-transparent text-white/52 hover:bg-white/[0.06] hover:text-white/78"
            }`}
            onClick={() => setSelectedArenaNetworkId(networkId)}
            title={network.missingEnvNames.length > 0 ? `${network.label} env is not configured` : network.label}
          >
            {selected ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--ghost)] shadow-[0_0_10px_var(--ghost)]" /> : null}
            {networkId === "ink" ? "Ink" : "LitVM"}
          </button>
        );
      })}
    </div>
  );
}

export function WalletControls() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const { selectedArenaNetworkId, selectedArenaNetwork } = useArenaNetwork();

  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.type === "injected") ?? connectors[0],
    [connectors],
  );

  useEffect(() => {
    let cancelled = false;

    const syncChainId = async () => {
      if (!isConnected) {
        if (!cancelled) {
          setWalletChainId(null);
        }
        return;
      }

      const detected = await readWalletChainId(walletClient);
      if (!cancelled && detected !== null) {
        setWalletChainId(detected);
      }
    };

    void syncChainId();
    const interval = setInterval(() => {
      void syncChainId();
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isConnected, walletClient]);

  const resolvedChainId = walletChainId ?? chainId;
  const selectedNetworkConfigured =
    selectedArenaNetwork.missingEnvNames.length === 0 && selectedArenaNetwork.chainId > 0;
  const wrongChain = isConnected && selectedNetworkConfigured && resolvedChainId !== selectedArenaNetwork.chainId;

  useEffect(() => {
    if (!isConnected || !address) {
      return;
    }

    void trackOncePerSession(`wallet_connected:${address.toLowerCase()}`, {
      eventName: "wallet_connected",
      walletAddress: address,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      metadata: {
        chainId: resolvedChainId ?? null,
      },
    });
  }, [address, isConnected, resolvedChainId]);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-2 text-xs text-red-100 sm:flex-row sm:items-center">
        <NetworkSelector />
        <button
          type="button"
          className="btn-connect disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!injectedConnector || isPending}
          onClick={() => {
            if (!injectedConnector) {
              return;
            }
            connect({ connector: injectedConnector });
          }}
        >
          {isPending ? "Connecting..." : "Connect Wallet"}
        </button>
        {connectError ? <p>{connectError.message}</p> : null}
      </div>
    );
  }

  if (wrongChain) {
    return (
      <div className="flex items-center gap-3">
        <NetworkSelector />
        <button
          type="button"
          className="rounded-[4px] border border-[var(--oracle)]/60 bg-[color-mix(in_srgb,var(--oracle)_12%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oracle)] transition hover:bg-[color-mix(in_srgb,var(--oracle)_18%,transparent)] disabled:opacity-60"
          onClick={() => {
            void ensureArenaNetwork(selectedArenaNetworkId, walletClient).catch(() => {
              if (selectedArenaNetwork.chainId > 0) {
                switchChain({ chainId: selectedArenaNetwork.chainId });
              }
            });
          }}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching..." : `Switch to ${selectedArenaNetwork.label}`}
        </button>
        <button
          type="button"
          className="btn-disconnect"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <NetworkSelector />
      <div className="wallet-address">
        {address ? shortAddress(address) : "Connected"}
      </div>
      <button
        type="button"
        className="btn-disconnect"
        onClick={() => disconnect()}
      >
        Disconnect
      </button>
    </div>
  );
}
