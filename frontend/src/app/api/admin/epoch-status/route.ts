import { NextRequest, NextResponse } from "next/server";
import { createPublicClient } from "viem";

import {
  getArenaSidecarConfigError,
  getArenaSidecarCurrentEpochId,
  getArenaSidecarEpochPool,
  getArenaSidecarEpochResult,
  getArenaSidecarTokenSelection,
  isArenaSidecarConfiguredForNetwork,
} from "@/lib/arenaSidecar";
import { getArenaNetworkConfig, getArenaNetworkId, getArenaNetworkTransport } from "@/lib/arenaNetworks";
import { getAgentRuntimeProfiles } from "@/lib/server/agentProfileStore";
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
    const networkId = getArenaNetworkId(request.nextUrl.searchParams.get("chain") ?? process.env.ARENA_SYNC_CHAIN);
    const network = getArenaNetworkConfig(networkId);
    const sidecarConfigured = isArenaSidecarConfiguredForNetwork(networkId);
    const publicClient = sidecarConfigured
      ? createPublicClient({
          chain: network.chain,
          transport: getArenaNetworkTransport(networkId),
        })
      : undefined;

    let epochId = getDiscoveryDailySeed();
    let contractStatus = "fallback";
    let contractError: string | null = null;

    if (sidecarConfigured) {
      const currentEpochId = await getArenaSidecarCurrentEpochId(publicClient, networkId);

      if (currentEpochId !== null) {
        epochId = Number(currentEpochId);
        contractStatus = "onchain";
      } else {
        contractStatus = "error";
        contractError = "Failed to read currentEpochId from arena sidecar";
      }
    } else {
      contractStatus = "missing_address";
      contractError = getArenaSidecarConfigError(networkId);
    }

    let picksError: string | null = null;
    const epochIdBigInt = BigInt(epochId);
    const livePicks = await getLiveAgentTokenPicksForEpoch(epochIdBigInt, Date.now(), networkId).catch((error) => {
      picksError = error instanceof Error ? error.message : "Failed to simulate token picks";
      return null;
    });

    const [epochResult, epochPool] = await Promise.all([
      getArenaSidecarEpochResult(epochIdBigInt, publicClient, networkId),
      getArenaSidecarEpochPool(epochIdBigInt, publicClient, networkId),
    ]);
    const runtimeProfiles = await getAgentRuntimeProfiles();

    const agents = await Promise.all(
      ([0, 1, 2, 3] as const).map(async (agentId) => {
        const selectionResult = await getArenaSidecarTokenSelection(epochIdBigInt, agentId, publicClient, networkId)
          .then((value) => ({ status: "fulfilled" as const, value }))
          .catch((reason) => ({ status: "rejected" as const, reason }));

        const dna = runtimeProfiles[agentId] ?? null;
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
            dna: null,
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
      chain: networkId,
      chainName: network.label,
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
