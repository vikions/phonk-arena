import type { WalletClient } from "viem";

import { type ArenaNetworkId, arenaNetworks, getArenaNetworkId } from "@/lib/arenaNetworks";
import {
  INK_MAINNET_CHAIN_ID,
} from "@/lib/inkChain";

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

export async function ensureArenaNetwork(
  networkIdInput: ArenaNetworkId | string | null | undefined,
  walletClient?: WalletClient | null,
): Promise<void> {
  const networkId = getArenaNetworkId(networkIdInput);
  const network = arenaNetworks[networkId];
  const networkErrorLabel = networkId === "ink" ? "Ink mainnet" : network.label;

  if (network.missingEnvNames.length > 0 || network.chainId <= 0 || network.walletAddParams.rpcUrls.length === 0) {
    throw new Error(`${network.label} network config is not available.`);
  }

  const requester = getRequester(walletClient);
  if (!requester) {
    throw new Error("Wallet provider not available.");
  }

  const currentChain = await requester
    .request({ method: "eth_chainId" })
    .then((value) => parseHexChainId(value))
    .catch(() => null);

  if (currentChain === network.chainId) {
    return;
  }

  try {
    await requester.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
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
          chainId: network.walletAddParams.chainId,
          chainName: network.walletAddParams.chainName,
          nativeCurrency: {
            ...network.walletAddParams.nativeCurrency,
          },
          rpcUrls: [...network.walletAddParams.rpcUrls],
          blockExplorerUrls: [...network.walletAddParams.blockExplorerUrls],
        },
      ],
    });

    await requester.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainIdHex }],
    });
  }

  const finalChain = await requester
    .request({ method: "eth_chainId" })
    .then((value) => parseHexChainId(value))
    .catch(() => null);

  if (finalChain !== network.chainId) {
    throw new Error(`Wallet is not on ${networkErrorLabel}.`);
  }
}

export async function ensureInkNetwork(walletClient?: WalletClient | null): Promise<void> {
  return ensureArenaNetwork("ink", walletClient);
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

export function isInkChain(chainId: number | undefined): boolean {
  return chainId === INK_MAINNET_CHAIN_ID;
}

export function isArenaChain(chainId: number | undefined, networkIdInput?: ArenaNetworkId | string | null): boolean {
  return chainId === arenaNetworks[getArenaNetworkId(networkIdInput)].chainId;
}
