import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";

import {
  epochArenaAbi,
  epochArenaAddress,
  epochArenaRpcUrl,
  getAgentDNA,
  getEpochTokenSelection,
} from "@/lib/contract";
import { inkMainnet } from "@/lib/inkChain";
import { agentPickToken } from "@/lib/tokenDiscovery";

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

    const epochIdRaw = await publicClient.readContract({
      address: epochArenaAddress,
      abi: epochArenaAbi,
      functionName: "currentEpochId",
    });
    const epochId = Number(epochIdRaw);

    const agents = await Promise.all(
      ([0, 1, 2, 3] as const).map(async (agentId) => {
        const [dna, currentSelection, wouldPickNow] = await Promise.all([
          getAgentDNA(agentId, publicClient),
          getEpochTokenSelection(BigInt(epochId), agentId, publicClient),
          agentPickToken(agentId),
        ]);

        return {
          agentId,
          name: AGENT_NAMES[agentId],
          dna,
          currentSelection: currentSelection
            ? {
                tokenAddress: currentSelection.tokenAddress,
                tokenSymbol: currentSelection.tokenSymbol,
                priceChangeBps: Math.round(currentSelection.priceChangeAtSelection),
                volumeAtSelection: currentSelection.volumeAtSelection,
                timestamp: currentSelection.timestamp,
              }
            : null,
          wouldPickNow: {
            symbol: wouldPickNow.symbol,
            address: wouldPickNow.address,
            priceChange24h: wouldPickNow.priceChange24h,
            volume24h: wouldPickNow.volume24h,
            holderCount: wouldPickNow.holderCount,
          },
        };
      }),
    );

    return NextResponse.json({
      epochId,
      timestamp: new Date().toISOString(),
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
