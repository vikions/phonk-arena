import type { Abi, Address, PublicClient, WalletClient } from "viem";
import { createPublicClient, getAddress, http, isAddress } from "viem";

import phonkArenaSidecarAbiJson from "@/lib/abi/PhonkArenaSidecar.json";
import { inkMainnet } from "@/lib/inkChain";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const DEFAULT_RPC_URL = "https://rpc-gel.inkonchain.com";
const DEFAULT_ARENA_SIDECAR_ADDRESS = "0xa21bbff7b8aD238F58B825e77191617568D0E809";

function normalizeAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) {
    return null;
  }

  return getAddress(trimmed);
}

function getReadonlyClient(publicClient?: PublicClient): PublicClient {
  if (publicClient) {
    return publicClient;
  }

  return createPublicClient({
    chain: inkMainnet,
    transport: http(process.env.NEXT_PUBLIC_INK_RPC || DEFAULT_RPC_URL),
  });
}

function toSafeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : 0;
  }

  return 0;
}

const parsedAbi = (phonkArenaSidecarAbiJson as { abi?: Abi }).abi;

export const arenaSidecarAbi = (Array.isArray(parsedAbi) ? parsedAbi : []) as Abi;
export const arenaSidecarAddress = (normalizeAddress(process.env.NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS) ??
  normalizeAddress(DEFAULT_ARENA_SIDECAR_ADDRESS) ??
  ZERO_ADDRESS) as Address;
export const isArenaSidecarConfigured = arenaSidecarAddress !== ZERO_ADDRESS && arenaSidecarAbi.length > 0;

export interface ArenaSidecarTokenSelectionView {
  tokenAddress: Address;
  tokenSymbol: string;
  startPriceUsdE8: bigint;
  startVolume24h: bigint;
  startHolderCount: bigint;
  startLiquidityUsd: bigint;
  startTxCount24h: bigint;
  timestamp: number;
  recorded: boolean;
}

export interface ArenaSidecarUserBetView {
  agentId: number;
  amount: bigint;
  claimed: boolean;
  exists: boolean;
}

export interface ArenaSidecarEpochResultView {
  finalized: boolean;
  winnerAgentId: number;
  scores: [bigint, bigint, bigint, bigint];
  totalPool: bigint;
}

export interface ArenaSidecarEpochPoolView {
  pools: [bigint, bigint, bigint, bigint];
  totalPool: bigint;
}

function normalizeTokenSelection(value: unknown): ArenaSidecarTokenSelectionView | null {
  if (Array.isArray(value) && value.length >= 9) {
    return {
      tokenAddress: (normalizeAddress(String(value[0])) ?? ZERO_ADDRESS) as Address,
      tokenSymbol: String(value[1] ?? ""),
      startPriceUsdE8: BigInt(value[2] ?? 0),
      startVolume24h: BigInt(value[3] ?? 0),
      startHolderCount: BigInt(value[4] ?? 0),
      startLiquidityUsd: BigInt(value[5] ?? 0),
      startTxCount24h: BigInt(value[6] ?? 0),
      timestamp: toSafeNumber(value[7]),
      recorded: Boolean(value[8]),
    };
  }

  return null;
}

function normalizeUserBet(value: unknown): ArenaSidecarUserBetView | null {
  if (Array.isArray(value) && value.length >= 4) {
    return {
      agentId: toSafeNumber(value[0]),
      amount: BigInt(value[1] ?? 0),
      claimed: Boolean(value[2]),
      exists: Boolean(value[3]),
    };
  }

  return null;
}

function normalizeEpochResult(value: unknown): ArenaSidecarEpochResultView | null {
  if (Array.isArray(value) && value.length >= 4) {
    const rawScores = Array.isArray(value[2]) ? value[2] : [];
    return {
      finalized: Boolean(value[0]),
      winnerAgentId: toSafeNumber(value[1]),
      scores: [
        BigInt(rawScores[0] ?? 0),
        BigInt(rawScores[1] ?? 0),
        BigInt(rawScores[2] ?? 0),
        BigInt(rawScores[3] ?? 0),
      ],
      totalPool: BigInt(value[3] ?? 0),
    };
  }

  return null;
}

function normalizeEpochPool(value: unknown): ArenaSidecarEpochPoolView | null {
  if (Array.isArray(value) && value.length >= 2) {
    const rawPools = Array.isArray(value[0]) ? value[0] : [];
    return {
      pools: [
        BigInt(rawPools[0] ?? 0),
        BigInt(rawPools[1] ?? 0),
        BigInt(rawPools[2] ?? 0),
        BigInt(rawPools[3] ?? 0),
      ],
      totalPool: BigInt(value[1] ?? 0),
    };
  }

  return null;
}

export async function getArenaSidecarTokenSelection(
  epochId: bigint | number,
  agentId: number,
  publicClient?: PublicClient,
): Promise<ArenaSidecarTokenSelectionView | null> {
  if (!isArenaSidecarConfigured) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient).readContract({
      address: arenaSidecarAddress,
      abi: arenaSidecarAbi,
      functionName: "getEpochTokenSelection",
      args: [BigInt(epochId), BigInt(agentId)],
    });

    return normalizeTokenSelection(result);
  } catch {
    return null;
  }
}

export async function placeArenaBet(
  walletClient: WalletClient,
  epochId: bigint | number,
  agentId: number,
  value: bigint,
): Promise<`0x${string}`> {
  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "placeBet",
    args: [BigInt(epochId), BigInt(agentId)],
    value,
  });
}

export async function claimArenaEpoch(
  walletClient: WalletClient,
  epochId: bigint | number,
): Promise<`0x${string}`> {
  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "claim",
    args: [BigInt(epochId)],
  });
}

export { normalizeEpochPool, normalizeEpochResult, normalizeTokenSelection, normalizeUserBet };
