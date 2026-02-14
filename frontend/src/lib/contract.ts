import { pad, stringToHex } from "viem";

export const resultsContractAddress = process.env.NEXT_PUBLIC_RESULTS_ADDRESS as
  | `0x${string}`
  | undefined;

export function matchIdToBytes32(matchId: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{64}$/.test(matchId)) {
    return matchId as `0x${string}`;
  }

  return pad(stringToHex(matchId.slice(0, 31)), {
    size: 32,
  });
}

export const winnerEnum = {
  TIE: 0,
  A: 1,
  B: 2,
} as const;

export const RESULTS_ABI = [
  {
    type: "function",
    name: "startMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeMatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "bytes32" },
      { name: "winner", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "started",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "finalized",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "startTimes",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minDuration",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;