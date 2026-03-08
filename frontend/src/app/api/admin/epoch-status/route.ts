import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "viem";

import {
  getArenaSidecarCurrentEpochId,
  getArenaSidecarEpochPool,
  getArenaSidecarEpochResult,
  getArenaSidecarTokenSelection,
  isArenaSidecarConfigured,
} from "@/lib/arenaSidecar";
import { getAgentDNA } from "@/lib/contract";
import { inkMainnet } from "@/lib/inkChain";
import { getInkRpcTransport } from "@/lib/inkRpc";
import { isAdminAuthorized } from "@/lib/server/arenaOracle";
import { getDiscoveryDailySeed, getLiveAgentTokenPicksForEpoch } from "@/lib/server/tokenDiscovery";
import { getSnapshotBackend } from "@/lib/server/tokenSnapshotStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGENT_NAMES: Record<0 | 1 | 2 | 3, string> = {
  0: "RAGE",
  1: "GHOST",
  2: "ORACLE",
  3: "GLITCH",
};

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publicClient = createPublicClient({
      chain: inkMainnet,
      transport: getInkRpcTransport(),
    });

    let epochId = getDiscoveryDailySeed();
    let contractStatus = "fallback";
    let contractError: string | null = null;

    if (isArenaSidecarConfigured) {
      const currentEpochId = await getArenaSidecarCurrentEpochId(publicClient);

      if (currentEpochId !== null) {
        epochId = Number(currentEpochId);
        contractStatus = "onchain";
      } else {
        contractStatus = "error";
        contractError = "Failed to read currentEpochId from arena sidecar";
      }
    } else {
      contractStatus = "missing_address";
      contractError = "NEXT_PUBLIC_ARENA_SIDECAR_ADDRESS is not configured";
    }

    let picksError: string | null = null;
    const epochIdBigInt = BigInt(epochId);
    const livePicks = await getLiveAgentTokenPicksForEpoch(epochIdBigInt).catch((error) => {
      picksError = error instanceof Error ? error.message : "Failed to simulate token picks";
      return null;
    });

    const [epochResult, epochPool] = await Promise.all([
      getArenaSidecarEpochResult(epochIdBigInt, publicClient),
      getArenaSidecarEpochPool(epochIdBigInt, publicClient),
    ]);

    const agents = await Promise.all(
      ([0, 1, 2, 3] as const).map(async (agentId) => {
        const [dnaResult, selectionResult] = await Promise.allSettled([
          getAgentDNA(agentId, publicClient),
          getArenaSidecarTokenSelection(epochIdBigInt, agentId, publicClient),
        ]);

        const dna = dnaResult.status === "fulfilled" ? dnaResult.value : null;
        const currentSelection = selectionResult.status === "fulfilled" ? selectionResult.value : null;
        const wouldPickNow = livePicks ? livePicks[agentId].token : null;

        return {
          agentId,
          name: AGENT_NAMES[agentId],
          dna,
          currentSelection:
            currentSelection?.recorded
              ? {
                  tokenAddress: currentSelection.tokenAddress,
                  tokenSymbol: currentSelection.tokenSymbol,
                  startPriceUsd: Number(currentSelection.startPriceUsdE8) / 1e8,
                  startVolume24h: Number(currentSelection.startVolume24h),
                  startHolderCount: Number(currentSelection.startHolderCount),
                  startLiquidityUsd: Number(currentSelection.startLiquidityUsd),
                  startTxCount24h: Number(currentSelection.startTxCount24h),
                  timestamp: currentSelection.timestamp,
                }
              : null,
          wouldPickNow:
            wouldPickNow
              ? {
                  symbol: wouldPickNow.symbol,
                  address: wouldPickNow.address,
                  priceUsd: wouldPickNow.priceUsd,
                  priceChange24h: wouldPickNow.priceChange24h,
                  volume24h: wouldPickNow.volume24h,
                  holderCount: wouldPickNow.holderCount,
                  holderDelta24h: wouldPickNow.holderDelta24h,
                  liquidityUsd: wouldPickNow.liquidityUsd,
                  txCount24h: wouldPickNow.txCount24h,
                  hypeScore: wouldPickNow.hypeScore,
                  strategyScore: wouldPickNow.strategyScore,
                  pairUrl: wouldPickNow.pairUrl,
                  createdAt: wouldPickNow.createdAt,
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
            wouldPickNow: picksError,
          },
        };
      }),
    );

    return NextResponse.json({
      epochId,
      timestamp: new Date().toISOString(),
      contractStatus,
      contractError,
      snapshotBackend: getSnapshotBackend(),
      market: {
        finalized: epochResult?.finalized ?? false,
        winnerAgentId: epochResult?.winnerAgentId ?? null,
        totalPoolWei: epochResult?.totalPool.toString() ?? "0",
        poolsWei: epochPool ? epochPool.pools.map((pool) => pool.toString()) : ["0", "0", "0", "0"],
      },
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
