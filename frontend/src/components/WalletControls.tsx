"use client";

import { useMemo } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useWalletClient,
  useSwitchChain,
} from "wagmi";

import { MONAD_MAINNET_CHAIN_ID } from "@/lib/monadChain";
import { ensureMonadNetwork } from "@/lib/walletNetwork";

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

  const injectedConnector = useMemo(
    () => connectors.find((connector) => connector.type === "injected") ?? connectors[0],
    [connectors],
  );

  const wrongChain = isConnected && chainId !== MONAD_MAINNET_CHAIN_ID;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-2 text-xs text-red-100">
        <button
          type="button"
          className="rounded-full border border-cyan-300/50 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-60"
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
          className="rounded-full border border-amber-300/60 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/25 disabled:opacity-60"
          onClick={() => {
            void ensureMonadNetwork(walletClient).catch(() => {
              switchChain({ chainId: MONAD_MAINNET_CHAIN_ID });
            });
          }}
          disabled={isSwitching}
        >
          {isSwitching ? "Switching..." : "Switch to Monad"}
        </button>
        <button
          type="button"
          className="rounded-full border border-white/20 px-3 py-2 text-sm text-white/80 transition hover:border-white/40"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-full border border-cyan-300/50 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100">
        {address ? shortAddress(address) : "Connected"}
      </div>
      <button
        type="button"
        className="rounded-full border border-white/20 px-3 py-2 text-sm text-white/80 transition hover:border-white/40"
        onClick={() => disconnect()}
      >
        Disconnect
      </button>
    </div>
  );
}
