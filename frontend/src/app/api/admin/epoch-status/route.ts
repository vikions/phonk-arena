import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";

import {
  epochArenaAbi,
  epochArenaAddress,
  epochArenaRpcUrl,
  getCurrentEpochId,
  getAgentDNA,
  getEpochTokenSelection,
  isEpochArenaAddressConfigured,
} from "@/lib/contract";
import { inkMainnet } from "@/lib/inkChain";
import { getDailyAgentTokenPicks } from "@/lib/tokenDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_NAMES: Record<0 | 1 | 2 | 3, string> = {
  0: "RAGE",
  1: "GHOST",
  2: "ORACLE",
  3: "GLITCH",
};

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publicClient = createPublicClient({
      chain: inkMainnet,
      transport: http(epochArenaRpcUrl),
    });

    let epochId = Number(getCurrentEpochId());
    let contractStatus = "fallback";
    let contractError: string | null = null;
    let dailyPicks:
      | Awaited<ReturnType<typeof getDailyAgentTokenPicks>>
      | null = null;
    let dailyPickError: string | null = null;

    if (isEpochArenaAddressConfigured) {
      try {
        const epochIdRaw = await publicClient.readContract({
          address: epochArenaAddress,
          abi: epochArenaAbi,
          functionName: "currentEpochId",
        });
        epochId = Number(epochIdRaw);
        contractStatus = "onchain";
      } catch (error) {
        contractStatus = "error";
        contractError =
          error instanceof Error ? error.message : "Failed to read currentEpochId from contract";
      }
    } else {
      contractStatus = "missing_address";
      contractError = "NEXT_PUBLIC_EPOCH_ARENA_ADDRESS is not configured";
    }

    try {
      dailyPicks = await getDailyAgentTokenPicks();
    } catch (error) {
      dailyPickError =
        error instanceof Error ? error.message : "Failed to simulate token picks";
    }

    const agents = await Promise.all(
      ([0, 1, 2, 3] as const).map(async (agentId) => {
        const [dnaResult, selectionResult] = await Promise.allSettled([
          getAgentDNA(agentId, publicClient),
          getEpochTokenSelection(BigInt(epochId), agentId, publicClient),
        ]);

        const dna = dnaResult.status === "fulfilled" ? dnaResult.value : null;
        const currentSelection = selectionResult.status === "fulfilled" ? selectionResult.value : null;
        const hasRecordedSelection =
          currentSelection &&
          currentSelection.tokenAddress !== "0x0000000000000000000000000000000000000000" &&
          Boolean(currentSelection.tokenSymbol);
        const wouldPickNow = dailyPicks ? dailyPicks[agentId] : null;

        return {
          agentId,
          name: AGENT_NAMES[agentId],
          dna,
          currentSelection: hasRecordedSelection && currentSelection
            ? {
                tokenAddress: currentSelection.tokenAddress,
                tokenSymbol: currentSelection.tokenSymbol,
                priceChangeBps: Math.round(currentSelection.priceChangeAtSelection),
                volumeAtSelection: currentSelection.volumeAtSelection,
                timestamp: currentSelection.timestamp,
              }
            : null,
          wouldPickNow: wouldPickNow
            ? {
                symbol: wouldPickNow.symbol,
                address: wouldPickNow.address,
                priceChange24h: wouldPickNow.priceChange24h,
                volume24h: wouldPickNow.volume24h,
                holderCount: wouldPickNow.holderCount,
              }
            : null,
          errors: {
            dna:
              dnaResult.status === "rejected"
                ? dnaResult.reason instanceof Error
                  ? dnaResult.reason.message
                  : "Failed to load DNA"
                : null,
            currentSelection:
              selectionResult.status === "rejected"
                ? selectionResult.reason instanceof Error
                  ? selectionResult.reason.message
                  : "Failed to load current selection"
                : null,
            wouldPickNow: dailyPickError,
          },
        };
      }),
    );

    return NextResponse.json({
      epochId,
      timestamp: new Date().toISOString(),
      contractStatus,
      contractError,
      agents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch epoch status",
      },
      { status: 500 },
    );
  }
}
