import type { WalletClient } from "viem";

import {
  MONAD_MAINNET_CHAIN_ID,
  MONAD_MAINNET_CHAIN_ID_HEX,
  monadMainnetWalletAddParams,
} from "@/lib/monadChain";

const UNKNOWN_CHAIN_CODE = 4902;

function getErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybe = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof maybe.code === "number") {
    return maybe.code;
  }

  if (typeof maybe.cause?.code === "number") {
    return maybe.cause.code;
  }

  return undefined;
}

function hasUnknownChainMessage(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybe = error as { message?: unknown; shortMessage?: unknown };
  const message =
    (typeof maybe.message === "string" ? maybe.message : "") +
    " " +
    (typeof maybe.shortMessage === "string" ? maybe.shortMessage : "");

  return (
    message.includes("4902") ||
    message.toLowerCase().includes("unknown chain") ||
    message.toLowerCase().includes("unrecognized chain") ||
    message.toLowerCase().includes("not been added")
  );
}

export async function ensureMonadNetwork(walletClient?: WalletClient | null): Promise<void> {
  if (!walletClient) {
    throw new Error("No wallet client available.");
  }

  try {
    await walletClient.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_MAINNET_CHAIN_ID_HEX }],
    });
    return;
  } catch (switchError) {
    const code = getErrorCode(switchError);
    const shouldAddChain = code === UNKNOWN_CHAIN_CODE || hasUnknownChainMessage(switchError);

    if (!shouldAddChain) {
      throw switchError;
    }
  }

  await walletClient.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: monadMainnetWalletAddParams.chainId,
        chainName: monadMainnetWalletAddParams.chainName,
        nativeCurrency: {
          ...monadMainnetWalletAddParams.nativeCurrency,
        },
        rpcUrls: [...monadMainnetWalletAddParams.rpcUrls],
        blockExplorerUrls: [...monadMainnetWalletAddParams.blockExplorerUrls],
      },
    ],
  });

  await walletClient.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: MONAD_MAINNET_CHAIN_ID_HEX }],
  });
}

export function isMonadChain(chainId: number | undefined): boolean {
  return chainId === MONAD_MAINNET_CHAIN_ID;
}
