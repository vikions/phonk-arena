import type { Abi, Address, PublicClient, WalletClient } from "viem";
import { createPublicClient, getAddress, isAddress, pad, stringToHex } from "viem";

import phonkArenaV2AbiJson from "@/lib/abi/PhonkArenaV2.json";
import { inkMainnet } from "@/lib/inkChain";
import { getInkRpcTransport, getInkRpcUrl } from "@/lib/inkRpc";
import type { VoteSide } from "@/lib/types";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function normalizeAddress(value: string | undefined): Address | null {
  const trimmed = value?.trim();
  if (!trimmed || !isAddress(trimmed)) {
    return null;
  }

  return getAddress(trimmed);
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

const fallbackEpochArenaAbi = [
  {
    type: "function",
    name: "currentEpochId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "vote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "side", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "placeBet",
    stateMutability: "payable",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "side", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getTally",
    stateMutability: "view",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
    ],
    outputs: [
      { name: "aVotes", type: "uint256" },
      { name: "bVotes", type: "uint256" },
      { name: "finalized", type: "bool" },
      { name: "winner", type: "uint8" },
      { name: "endTime", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "finalizeEpoch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "betA",
    stateMutability: "view",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "betB",
    stateMutability: "view",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "hasVoted",
    stateMutability: "view",
    inputs: [
      { name: "lobbyId", type: "bytes32" },
      { name: "epochId", type: "uint256" },
      { name: "user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "recordTokenSelection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "epochId", type: "uint256" },
      { name: "agentId", type: "uint8" },
      { name: "tokenAddress", type: "address" },
      { name: "tokenSymbol", type: "string" },
      { name: "priceChange", type: "int256" },
      { name: "volume", type: "uint256" },
      { name: "holderCount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getAgentDNA",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint8" }],
    outputs: [
      { name: "mutationVersion", type: "uint256" },
      { name: "bpmRange", type: "uint256" },
      { name: "layerDensity", type: "uint256" },
      { name: "glitchIntensity", type: "uint256" },
      { name: "bassWeight", type: "uint256" },
      { name: "wins", type: "uint256" },
      { name: "losses", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getEpochTokenSelection",
    stateMutability: "view",
    inputs: [
      { name: "epochId", type: "uint256" },
      { name: "agentId", type: "uint8" },
    ],
    outputs: [
      { name: "tokenAddress", type: "address" },
      { name: "tokenSymbol", type: "string" },
      { name: "priceChangeAtSelection", type: "int256" },
      { name: "volumeAtSelection", type: "uint256" },
      { name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "initializeAgents",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const satisfies Abi;

const parsedAbi = (phonkArenaV2AbiJson as { abi?: Abi }).abi;

export const hasRuntimeEpochArenaAbi = Array.isArray(parsedAbi) && parsedAbi.length > 0;
export const epochArenaAbi = (hasRuntimeEpochArenaAbi ? parsedAbi : fallbackEpochArenaAbi) as Abi;

export const epochArenaRpcUrl = getInkRpcUrl();
const parsedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? inkMainnet.id);
export const epochArenaChainId = Number.isFinite(parsedChainId) ? parsedChainId : inkMainnet.id;

export const epochArenaAddress = (normalizeAddress(process.env.NEXT_PUBLIC_EPOCH_ARENA_ADDRESS) ??
  ZERO_ADDRESS) as Address;
export const isEpochArenaAddressConfigured = epochArenaAddress !== ZERO_ADDRESS;

export const epochArenaFunctionNames = {
  currentEpochId: "currentEpochId",
  vote: "vote",
  placeBet: "placeBet",
  getTally: "getTally",
  finalizeEpoch: "finalizeEpoch",
  claim: "claim",
  betA: "betA",
  betB: "betB",
  claimed: "claimed",
  hasVoted: "hasVoted",
  recordTokenSelection: "recordTokenSelection",
  getAgentDNA: "getAgentDNA",
  getEpochTokenSelection: "getEpochTokenSelection",
  initializeAgents: "initializeAgents",
} as const;

export interface AgentDNAContractView {
  mutationVersion: number;
  bpmRange: number;
  layerDensity: number;
  glitchIntensity: number;
  bassWeight: number;
  wins: number;
  losses: number;
}

export interface EpochTokenSelectionContractView {
  tokenAddress: Address;
  tokenSymbol: string;
  priceChangeAtSelection: number;
  volumeAtSelection: number;
  timestamp: number;
}

export interface RecordTokenSelectionInput {
  epochId: bigint | number;
  agentId: number;
  tokenAddress: string;
  tokenSymbol: string;
  priceChange: number;
  volume: number;
  holderCount: number;
}

function getReadonlyClient(publicClient?: PublicClient): PublicClient {
  if (publicClient) {
    return publicClient;
  }

  return createPublicClient({
    chain: inkMainnet,
    transport: getInkRpcTransport(),
  });
}

function asEpochId(value: bigint | number): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return BigInt(safe);
}

function asAgentId(value: number): bigint {
  const safe = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return BigInt(safe);
}

function normalizeAgentDNA(value: unknown): AgentDNAContractView | null {
  if (Array.isArray(value) && value.length >= 7) {
    return {
      mutationVersion: toSafeNumber(value[0]),
      bpmRange: toSafeNumber(value[1]),
      layerDensity: toSafeNumber(value[2]),
      glitchIntensity: toSafeNumber(value[3]),
      bassWeight: toSafeNumber(value[4]),
      wins: toSafeNumber(value[5]),
      losses: toSafeNumber(value[6]),
    };
  }

  if (value && typeof value === "object") {
    const maybe = value as Partial<Record<keyof AgentDNAContractView, unknown>>;
    return {
      mutationVersion: toSafeNumber(maybe.mutationVersion),
      bpmRange: toSafeNumber(maybe.bpmRange),
      layerDensity: toSafeNumber(maybe.layerDensity),
      glitchIntensity: toSafeNumber(maybe.glitchIntensity),
      bassWeight: toSafeNumber(maybe.bassWeight),
      wins: toSafeNumber(maybe.wins),
      losses: toSafeNumber(maybe.losses),
    };
  }

  return null;
}

function normalizeEpochTokenSelection(value: unknown): EpochTokenSelectionContractView | null {
  if (Array.isArray(value) && value.length >= 5) {
    return {
      tokenAddress: (normalizeAddress(String(value[0])) ?? ZERO_ADDRESS) as Address,
      tokenSymbol: String(value[1] ?? ""),
      priceChangeAtSelection: toSafeNumber(value[2]),
      volumeAtSelection: toSafeNumber(value[3]),
      timestamp: toSafeNumber(value[4]),
    };
  }

  if (value && typeof value === "object") {
    const maybe = value as Partial<Record<keyof EpochTokenSelectionContractView, unknown>>;
    return {
      tokenAddress: (normalizeAddress(String(maybe.tokenAddress ?? "")) ?? ZERO_ADDRESS) as Address,
      tokenSymbol: String(maybe.tokenSymbol ?? ""),
      priceChangeAtSelection: toSafeNumber(maybe.priceChangeAtSelection),
      volumeAtSelection: toSafeNumber(maybe.volumeAtSelection),
      timestamp: toSafeNumber(maybe.timestamp),
    };
  }

  return null;
}

export async function getAgentDNA(
  agentId: number,
  publicClient?: PublicClient,
): Promise<AgentDNAContractView | null> {
  if (!isEpochArenaAddressConfigured) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient).readContract({
      address: epochArenaAddress,
      abi: epochArenaAbi,
      functionName: epochArenaFunctionNames.getAgentDNA,
      args: [asAgentId(agentId)],
    });

    return normalizeAgentDNA(result);
  } catch {
    return null;
  }
}

export async function getEpochTokenSelection(
  epochId: bigint | number,
  agentId: number,
  publicClient?: PublicClient,
): Promise<EpochTokenSelectionContractView | null> {
  if (!isEpochArenaAddressConfigured) {
    return null;
  }

  try {
    const result = await getReadonlyClient(publicClient).readContract({
      address: epochArenaAddress,
      abi: epochArenaAbi,
      functionName: epochArenaFunctionNames.getEpochTokenSelection,
      args: [asEpochId(epochId), asAgentId(agentId)],
    });

    return normalizeEpochTokenSelection(result);
  } catch {
    return null;
  }
}

export async function recordTokenSelection(
  walletClient: WalletClient,
  input: RecordTokenSelectionInput,
): Promise<`0x${string}`> {
  const tokenAddress = (normalizeAddress(input.tokenAddress) ?? ZERO_ADDRESS) as Address;

  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: epochArenaAddress,
    abi: epochArenaAbi,
    functionName: epochArenaFunctionNames.recordTokenSelection,
    args: [
      asEpochId(input.epochId),
      asAgentId(input.agentId),
      tokenAddress,
      input.tokenSymbol,
      BigInt(Math.trunc(input.priceChange)),
      BigInt(Math.max(0, Math.trunc(input.volume))),
      BigInt(Math.max(0, Math.trunc(input.holderCount))),
    ],
  });
}

export async function initializeAgents(walletClient: WalletClient): Promise<`0x${string}`> {
  return (walletClient as unknown as { writeContract: (config: unknown) => Promise<`0x${string}`> }).writeContract({
    address: epochArenaAddress,
    abi: epochArenaAbi,
    functionName: epochArenaFunctionNames.initializeAgents,
    args: [],
  });
}

export function lobbyIdToBytes32(lobbyId: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{64}$/.test(lobbyId)) {
    return lobbyId as `0x${string}`;
  }

  return pad(stringToHex(lobbyId.slice(0, 31)), {
    size: 32,
    dir: "right",
  });
}

export function getCurrentEpochId(nowMs = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 1000 / 3600));
}

export function getEpochEndTimestampSec(nowMs = Date.now()): number {
  return (Math.floor(nowMs / 1000 / 3600) + 1) * 3600;
}

export function voteSideToContractSide(side: VoteSide): number {
  // Contract enum mapping: 1 = A, 2 = B (0 = Tie).
  return side === "A" ? 1 : 2;
}

export function betSideToContractSide(side: VoteSide): number {
  // Betting often uses winner enum: 1 = A, 2 = B (0 reserved for Tie).
  return side === "A" ? 1 : 2;
}

export function contractSideToVoteSide(side: bigint | number): VoteSide {
  return Number(side) === 1 ? "A" : "B";
}
