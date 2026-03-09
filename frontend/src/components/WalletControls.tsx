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

import { INK_MAINNET_CHAIN_ID } from "@/lib/inkChain";
import { ensureInkNetwork, readWalletChainId } from "@/lib/walletNetwork";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletControls() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

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
  const wrongChain = isConnected && resolvedChainId !== INK_MAINNET_CHAIN_ID;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-2 text-xs text-red-100">
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
        <button
          type="button"
          className="rounded-[4px] border border-[var(--oracle)]/60 bg-[color-mix(in_srgb,var(--oracle)_12%,transparent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oracle)] transition hover:bg-[color-mix(in_srgb,var(--oracle)_18%,transparent)] disabled:opacity-60"
          onClick={() => {
            void ensureInkNetwork(walletClient).catch(() => {
              switchChain({ chainId: INK_MAINNET_CHAIN_ID });
            });
          }}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching..." : "Switch to Ink"}
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
