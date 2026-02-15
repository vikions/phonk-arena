import type { WalletClient } from "viem";

import {
  MONAD_MAINNET_CHAIN_ID,
  MONAD_MAINNET_CHAIN_ID_HEX,
  monadMainnetWalletAddParams,
} from "@/lib/monadChain";

const UNKNOWN_CHAIN_CODE = 4902;

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

function getWindowProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") {
    return null;
  }

  const maybe = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return maybe && typeof maybe.request === "function" ? maybe : null;
}

function getRequester(walletClient?: WalletClient | null): Eip1193Provider | null {
  if (walletClient) {
    return walletClient as unknown as Eip1193Provider;
  }

  return getWindowProvider();
}

function parseHexChainId(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  if (!normalized.startsWith("0x")) {
    return null;
  }

  const parsed = Number.parseInt(normalized.slice(2), 16);
  return Number.isFinite(parsed) ? parsed : null;
}

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
  const requester = getRequester(walletClient);
  if (!requester) {
    throw new Error("Wallet provider not available.");
  }

  const currentChain = await requester
    .request({ method: "eth_chainId" })
    .then((value) => parseHexChainId(value))
    .catch(() => null);

  if (currentChain === MONAD_MAINNET_CHAIN_ID) {
    return;
  }

  try {
    await requester.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_MAINNET_CHAIN_ID_HEX }],
    });
  } catch (switchError) {
    const code = getErrorCode(switchError);
    const shouldAddChain = code === UNKNOWN_CHAIN_CODE || hasUnknownChainMessage(switchError);

    if (!shouldAddChain) {
      throw switchError;
    }

    await requester.request({
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

    await requester.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: MONAD_MAINNET_CHAIN_ID_HEX }],
    });
  }

  const finalChain = await requester
    .request({ method: "eth_chainId" })
    .then((value) => parseHexChainId(value))
    .catch(() => null);

  if (finalChain !== MONAD_MAINNET_CHAIN_ID) {
    throw new Error("Wallet is not on Monad mainnet.");
  }
}

export async function readWalletChainId(walletClient?: WalletClient | null): Promise<number | null> {
  const requester = getRequester(walletClient);
  if (!requester) {
    return null;
  }

  try {
    const value = await requester.request({
      method: "eth_chainId",
    });
    return parseHexChainId(value);
  } catch {
    return null;
  }
}

export function isMonadChain(chainId: number | undefined): boolean {
  return chainId === MONAD_MAINNET_CHAIN_ID;
}
