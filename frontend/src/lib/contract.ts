import type { Abi } from "viem";
import { pad, stringToHex } from "viem";

import epochArenaAbiJson from "@/lib/abi/PhonkArenaEpochArena.json";
import type { VoteSide } from "@/lib/types";

export const epochArenaAddress = (
  process.env.NEXT_PUBLIC_EPOCH_ARENA_ADDRESS ?? "0x51bfB2A08E7680786eD54a00eE4d915Bab6B3867"
) as `0x${string}`;

export const epochArenaAbi = epochArenaAbiJson as Abi;

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
  // Enum-style mapping: 0 = A, 1 = B.
  return side === "A" ? 0 : 1;
}

export function betSideToContractSide(side: VoteSide): number {
  // Betting often uses winner enum: 1 = A, 2 = B (0 reserved for Tie).
  return side === "A" ? 1 : 2;
}

export function contractSideToVoteSide(side: bigint | number): VoteSide {
  return Number(side) === 0 ? "A" : "B";
}
