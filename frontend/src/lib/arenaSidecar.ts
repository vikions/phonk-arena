import type { Abi, Address, PublicClient, WalletClient } from "viem";
import { createPublicClient, getAddress, isAddress } from "viem";

import phonkArenaSidecarAbiJson from "@/lib/abi/PhonkArenaSidecar.json";
import {
  DEFAULT_ARENA_NETWORK_ID,
  type ArenaNetworkId,
  arenaNetworks,
  getArenaNetworkConfig,
  getArenaNetworkId,
  getArenaNetworkTransport,
  isArenaNetworkConfigured,
} from "@/lib/arenaNetworks";
import { DEFAULT_INK_RPC_URL, getInkRpcUrl } from "@/lib/inkRpc";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const DEFAULT_ARENA_SIDECAR_ADDRESS = "0xa21bbff7b8aD238F58B825e77191617568D0E809";

function normalizeAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) {
    return null;
  }

  return getAddress(trimmed);
}

function getReadonlyClient(publicClient?: PublicClient, networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID): PublicClient {
  if (publicClient) {
    return publicClient;
  }

  const network = getArenaNetworkConfig(networkId);

  return createPublicClient({
    chain: network.chain,
    transport: getArenaNetworkTransport(networkId),
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

function toBigIntValue(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }

  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }

  if (typeof value === "boolean") {
    return value ? 1n : 0n;
  }

  return 0n;
}

const parsedAbi = (phonkArenaSidecarAbiJson as { abi?: Abi }).abi;

export const arenaSidecarAbi = (Array.isArray(parsedAbi) ? parsedAbi : []) as Abi;
export const arenaSidecarRpcUrl = getInkRpcUrl() || DEFAULT_INK_RPC_URL;
export const arenaSidecarAddress = (normalizeAddress(process.env.NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS) ??
  normalizeAddress(DEFAULT_ARENA_SIDECAR_ADDRESS) ??
  ZERO_ADDRESS) as Address;
export const isArenaSidecarConfigured = arenaSidecarAddress !== ZERO_ADDRESS && arenaSidecarAbi.length > 0;

export function getArenaSidecarAddress(value?: string | null): Address {
  const networkId = getArenaNetworkId(value);

  if (networkId === "ink") {
    return arenaSidecarAddress;
  }

  return (normalizeAddress(process.env.NEXT_PUBLIC_LITVM_ARENA_SIDECAR_ADDRESS) ?? ZERO_ADDRESS) as Address;
}

export function getArenaSidecarRpcUrl(value?: string | null): string {
  const networkId = getArenaNetworkId(value);
  return networkId === "ink" ? arenaSidecarRpcUrl : arenaNetworks[networkId].rpcUrl;
}

export function getArenaSidecarConfigError(value?: string | null): string | null {
  const networkId = getArenaNetworkId(value);
  const network = arenaNetworks[networkId];

  if (!isArenaNetworkConfigured(networkId)) {
    return `${network.missingEnvNames.join(", ")} ${network.missingEnvNames.length === 1 ? "is" : "are"} not configured.`;
  }

  if (getArenaSidecarAddress(networkId) === ZERO_ADDRESS) {
    return `${network.sidecarAddressEnvName} is not configured.`;
  }

  if (arenaSidecarAbi.length === 0) {
    return "PhonkArenaSidecar ABI is missing.";
  }

  return null;
}

export function isArenaSidecarConfiguredForNetwork(value?: string | null): boolean {
  return getArenaSidecarConfigError(value) === null;
}

function getLitvmGasOverride(networkId: ArenaNetworkId, gas: bigint) {
  return networkId === "litvm" ? { gas } : {};
}

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

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  if (isRecordLike(value)) {
    return {
      tokenAddress: (normalizeAddress(String(value.tokenAddress ?? "")) ?? ZERO_ADDRESS) as Address,
      tokenSymbol: String(value.tokenSymbol ?? ""),
      startPriceUsdE8: toBigIntValue(value.startPriceUsdE8),
      startVolume24h: toBigIntValue(value.startVolume24h),
      startHolderCount: toBigIntValue(value.startHolderCount),
      startLiquidityUsd: toBigIntValue(value.startLiquidityUsd),
      startTxCount24h: toBigIntValue(value.startTxCount24h),
      timestamp: toSafeNumber(value.timestamp),
      recorded: Boolean(value.recorded),
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

  if (isRecordLike(value)) {
    return {
      agentId: toSafeNumber(value.agentId),
      amount: toBigIntValue(value.amount),
      claimed: Boolean(value.claimed),
      exists: Boolean(value.exists),
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

  if (isRecordLike(value)) {
    const rawScores = Array.isArray(value.scores) ? value.scores : [];
    return {
      finalized: Boolean(value.finalized),
      winnerAgentId: toSafeNumber(value.winnerAgentId),
      scores: [
        toBigIntValue(rawScores[0]),
        toBigIntValue(rawScores[1]),
        toBigIntValue(rawScores[2]),
        toBigIntValue(rawScores[3]),
      ],
      totalPool: toBigIntValue(value.totalPool),
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

  if (isRecordLike(value)) {
    const rawPools = Array.isArray(value.pools) ? value.pools : [];
    return {
      pools: [
        toBigIntValue(rawPools[0]),
        toBigIntValue(rawPools[1]),
        toBigIntValue(rawPools[2]),
        toBigIntValue(rawPools[3]),
      ],
      totalPool: toBigIntValue(value.totalPool),
    };
  }

  return null;
}

export async function getArenaSidecarTokenSelection(
  epochId: bigint | number,
  agentId: number,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<ArenaSidecarTokenSelectionView | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "getEpochTokenSelection",
      args: [BigInt(epochId), BigInt(agentId)],
    });

    return normalizeTokenSelection(result);
  } catch {
    return null;
  }
}

export async function getArenaSidecarCurrentEpochId(
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<bigint | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "currentEpochId",
      args: [],
    });

    return typeof result === "bigint" ? result : BigInt(result as number);
  } catch {
    return null;
  }
}

export async function getArenaSidecarEpochEnd(
  epochId: bigint | number,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<bigint | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "epochEnd",
      args: [BigInt(epochId)],
    });

    return typeof result === "bigint" ? result : BigInt(result as number);
  } catch {
    return null;
  }
}

export async function getArenaSidecarEpochStart(
  epochId: bigint | number,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<bigint | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "epochStart",
      args: [BigInt(epochId)],
    });

    return typeof result === "bigint" ? result : BigInt(result as number);
  } catch {
    return null;
  }
}

export async function isArenaSidecarEpochOpen(
  epochId: bigint | number,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<boolean | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "isEpochOpen",
      args: [BigInt(epochId)],
    });

    return Boolean(result);
  } catch {
    return null;
  }
}

export async function getArenaSidecarEpochResult(
  epochId: bigint | number,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<ArenaSidecarEpochResultView | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "getEpochResult",
      args: [BigInt(epochId)],
    });

    return normalizeEpochResult(result);
  } catch {
    return null;
  }
}

export async function getArenaSidecarEpochPool(
  epochId: bigint | number,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<ArenaSidecarEpochPoolView | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "getEpochPool",
      args: [BigInt(epochId)],
    });

    return normalizeEpochPool(result);
  } catch {
    return null;
  }
}

export async function getArenaSidecarUserBet(
  epochId: bigint | number,
  user: Address | string,
  publicClient?: PublicClient,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<ArenaSidecarUserBetView | null> {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    return null;
  }

  const normalizedUser = normalizeAddress(String(user));
  if (!normalizedUser) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient, networkId).readContract({
      address: getArenaSidecarAddress(networkId),
      abi: arenaSidecarAbi,
      functionName: "getUserBet",
      args: [BigInt(epochId), normalizedUser],
    });

    return normalizeUserBet(result);
  } catch {
    return null;
  }
}

export interface ArenaRecordTokenSelectionInput {
  epochId: bigint | number;
  agentId: number;
  tokenAddress: string;
  tokenSymbol: string;
  startPriceUsdE8: bigint | number;
  startVolume24h: bigint | number;
  startHolderCount: bigint | number;
  startLiquidityUsd: bigint | number;
  startTxCount24h: bigint | number;
}

export interface ArenaFinalizeEpochInput {
  epochId: bigint | number;
  finalPriceUsdE8: [bigint, bigint, bigint, bigint];
  finalVolume24h: [bigint, bigint, bigint, bigint];
  finalHolderCount: [bigint, bigint, bigint, bigint];
  finalLiquidityUsd: [bigint, bigint, bigint, bigint];
  finalTxCount24h: [bigint, bigint, bigint, bigint];
}

export async function recordArenaTokenSelection(
  walletClient: WalletClient,
  input: ArenaRecordTokenSelectionInput,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<`0x${string}`> {
  const tokenAddress = (normalizeAddress(input.tokenAddress) ?? ZERO_ADDRESS) as Address;

  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: getArenaSidecarAddress(networkId),
    abi: arenaSidecarAbi,
    functionName: "recordTokenSelection",
    ...getLitvmGasOverride(networkId, 500_000n),
    args: [
      BigInt(input.epochId),
      BigInt(input.agentId),
      tokenAddress,
      input.tokenSymbol,
      BigInt(input.startPriceUsdE8),
      BigInt(input.startVolume24h),
      BigInt(input.startHolderCount),
      BigInt(input.startLiquidityUsd),
      BigInt(input.startTxCount24h),
    ],
  });
}

export async function finalizeArenaEpoch(
  walletClient: WalletClient,
  input: ArenaFinalizeEpochInput,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<`0x${string}`> {
  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: getArenaSidecarAddress(networkId),
    abi: arenaSidecarAbi,
    functionName: "finalizeEpoch",
    ...getLitvmGasOverride(networkId, 900_000n),
    args: [
      BigInt(input.epochId),
      input.finalPriceUsdE8,
      input.finalVolume24h,
      input.finalHolderCount,
      input.finalLiquidityUsd,
      input.finalTxCount24h,
    ],
  });
}

export async function placeArenaBet(
  walletClient: WalletClient,
  epochId: bigint | number,
  agentId: number,
  value: bigint,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<`0x${string}`> {
  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: getArenaSidecarAddress(networkId),
    abi: arenaSidecarAbi,
    functionName: "placeBet",
    ...getLitvmGasOverride(networkId, 300_000n),
    args: [BigInt(epochId), BigInt(agentId)],
    value,
  });
}

export async function claimArenaEpoch(
  walletClient: WalletClient,
  epochId: bigint | number,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<`0x${string}`> {
  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: getArenaSidecarAddress(networkId),
    abi: arenaSidecarAbi,
    functionName: "claim",
    ...getLitvmGasOverride(networkId, 300_000n),
    args: [BigInt(epochId)],
  });
}

export { normalizeEpochPool, normalizeEpochResult, normalizeTokenSelection, normalizeUserBet };
