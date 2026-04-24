import type { Chain } from "viem";
import { defineChain, fallback, http } from "viem";

import {
  INK_MAINNET_CHAIN_ID,
  INK_MAINNET_CHAIN_ID_HEX,
  INK_MAINNET_EXPLORER_URL,
  INK_MAINNET_RPC_URL,
  inkMainnet,
  inkMainnetWalletAddParams,
} from "@/lib/inkChain";
import { getInkRpcTransport } from "@/lib/inkRpc";

export const ARENA_NETWORK_IDS = ["ink", "litvm"] as const;
export type ArenaNetworkId = (typeof ARENA_NETWORK_IDS)[number];

export const DEFAULT_ARENA_NETWORK_ID: ArenaNetworkId = "ink";

interface WalletAddParams {
  chainId: `0x${string}`;
  chainName: string;
  nativeCurrency: Chain["nativeCurrency"];
  rpcUrls: readonly string[];
  blockExplorerUrls: readonly string[];
}

export interface ArenaNetworkConfig {
  id: ArenaNetworkId;
  label: string;
  chain: Chain;
  chainId: number;
  chainIdHex: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
  walletAddParams: WalletAddParams;
  sidecarAddressEnvName: string;
  missingEnvNames: string[];
}

function parseChainId(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toChainIdHex(chainId: number): `0x${string}` {
  return `0x${Math.max(0, chainId).toString(16)}` as const;
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => (value || "").trim()).filter((value) => value.length > 0))];
}

const litvmChainId = parseChainId(process.env.NEXT_PUBLIC_LITVM_CHAIN_ID);
const litvmRpcUrl = (process.env.NEXT_PUBLIC_LITVM_RPC || "").trim();
const litvmExplorerUrl = (process.env.NEXT_PUBLIC_LITVM_EXPLORER_URL || "").trim();

export const litvmTestnet = defineChain({
  id: litvmChainId,
  name: "LitVM Testnet",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: { http: litvmRpcUrl ? [litvmRpcUrl] : [] },
  },
  blockExplorers: litvmExplorerUrl
    ? {
        default: { name: "LitVM Explorer", url: litvmExplorerUrl },
      }
    : undefined,
});

export const LITVM_TESTNET_CHAIN_ID = litvmTestnet.id;
export const LITVM_TESTNET_CHAIN_ID_HEX = toChainIdHex(LITVM_TESTNET_CHAIN_ID);
export const LITVM_TESTNET_RPC_URL = litvmRpcUrl;
export const LITVM_TESTNET_EXPLORER_URL = litvmExplorerUrl;

export const litvmTestnetWalletAddParams = {
  chainId: LITVM_TESTNET_CHAIN_ID_HEX,
  chainName: litvmTestnet.name,
  nativeCurrency: litvmTestnet.nativeCurrency,
  rpcUrls: litvmRpcUrl ? [litvmRpcUrl] : [],
  blockExplorerUrls: litvmExplorerUrl ? [litvmExplorerUrl] : [],
} as const;

const litvmMissingEnvNames = [
  litvmChainId > 0 ? null : "NEXT_PUBLIC_LITVM_CHAIN_ID",
  litvmRpcUrl ? null : "NEXT_PUBLIC_LITVM_RPC",
  litvmExplorerUrl ? null : "NEXT_PUBLIC_LITVM_EXPLORER_URL",
].filter((value): value is string => Boolean(value));

export const arenaNetworks: Record<ArenaNetworkId, ArenaNetworkConfig> = {
  ink: {
    id: "ink",
    label: "Ink",
    chain: inkMainnet,
    chainId: INK_MAINNET_CHAIN_ID,
    chainIdHex: INK_MAINNET_CHAIN_ID_HEX,
    rpcUrl: INK_MAINNET_RPC_URL,
    explorerUrl: INK_MAINNET_EXPLORER_URL,
    walletAddParams: inkMainnetWalletAddParams,
    sidecarAddressEnvName: "NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS",
    missingEnvNames: [],
  },
  litvm: {
    id: "litvm",
    label: "LitVM Testnet",
    chain: litvmTestnet,
    chainId: LITVM_TESTNET_CHAIN_ID,
    chainIdHex: LITVM_TESTNET_CHAIN_ID_HEX,
    rpcUrl: LITVM_TESTNET_RPC_URL,
    explorerUrl: LITVM_TESTNET_EXPLORER_URL,
    walletAddParams: litvmTestnetWalletAddParams,
    sidecarAddressEnvName: "NEXT_PUBLIC_LITVM_ARENA_SIDECAR_ADDRESS",
    missingEnvNames: litvmMissingEnvNames,
  },
};

export function getArenaNetworkId(value: string | null | undefined): ArenaNetworkId {
  return ARENA_NETWORK_IDS.includes(value as ArenaNetworkId) ? (value as ArenaNetworkId) : DEFAULT_ARENA_NETWORK_ID;
}

export function getArenaNetworkConfig(value?: string | null): ArenaNetworkConfig {
  return arenaNetworks[getArenaNetworkId(value)];
}

export function isArenaNetworkConfigured(value?: string | null): boolean {
  return getArenaNetworkConfig(value).missingEnvNames.length === 0;
}

export function getArenaNetworkTransport(value?: string | null) {
  const networkId = getArenaNetworkId(value);

  if (networkId === "ink") {
    return getInkRpcTransport();
  }

  const urls = unique([arenaNetworks[networkId].rpcUrl]);
  if (urls.length === 0) {
    throw new Error(`${arenaNetworks[networkId].label} RPC is not configured.`);
  }

  const transports = urls.map((url) =>
    http(url, {
      timeout: 12_000,
      retryCount: 1,
      retryDelay: 1_000,
    }),
  );

  return transports.length > 1 ? fallback(transports) : transports[0];
}

export function getArenaWagmiChains(): [Chain, ...Chain[]] {
  return isArenaNetworkConfigured("litvm") ? [inkMainnet, litvmTestnet] : [inkMainnet];
}
