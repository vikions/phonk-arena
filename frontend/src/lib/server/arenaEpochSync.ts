import "server-only";

import { createPublicClient } from "viem";

import {
  finalizeArenaEpoch,
  getArenaSidecarCurrentEpochId,
  getArenaSidecarEpochResult,
  getArenaSidecarTokenSelection,
  isArenaSidecarConfiguredForNetwork,
  isArenaSidecarEpochOpen,
  recordArenaTokenSelection,
} from "@/lib/arenaSidecar";
import {
  DEFAULT_ARENA_NETWORK_ID,
  type ArenaNetworkId,
  getArenaNetworkConfig,
  getArenaNetworkTransport,
} from "@/lib/arenaNetworks";
import { applyArenaEpochProgressionIfNeeded } from "@/lib/server/agentProfileStore";
import { getArenaOracleWalletClient } from "@/lib/server/arenaOracle";
import { getAgentTokenPicksForEpoch, getLiveArenaTokenMetrics } from "@/lib/server/tokenDiscovery";

const AGENT_IDS = [0, 1, 2, 3] as const;

function includesErrorName(error: unknown, errorName: string): boolean {
  if (!error) {
    return false;
  }

  const direct = error as { name?: string; shortMessage?: string; message?: string; cause?: unknown; data?: { errorName?: string } };
  if (direct.name === errorName || direct.data?.errorName === errorName) {
    return true;
  }

  const shortMessage = typeof direct.shortMessage === "string" ? direct.shortMessage : "";
  const message = typeof direct.message === "string" ? direct.message : "";
  if (shortMessage.includes(errorName) || message.includes(errorName)) {
    return true;
  }

  return direct.cause ? includesErrorName(direct.cause, errorName) : false;
}

function toE8(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    return 0n;
  }

  return BigInt(Math.max(0, Math.round(value * 1e8)));
}

function toUint(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    return 0n;
  }

  return BigInt(Math.max(0, Math.round(value)));
}

export async function syncCurrentArenaEpochStart(networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID) {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    throw new Error("Arena sidecar is not configured.");
  }

  const currentEpochId = await getArenaSidecarCurrentEpochId(undefined, networkId);
  if (currentEpochId === null) {
    throw new Error("Unable to read current arena epoch.");
  }

  const picks = await getAgentTokenPicksForEpoch(currentEpochId);
  const walletClient = getArenaOracleWalletClient(networkId);
  const actions: Array<{
    agentId: number;
    action: "recorded" | "skipped";
    tokenSymbol: string;
    tokenAddress: string;
    txHash?: `0x${string}`;
  }> = [];

  for (const agentId of AGENT_IDS) {
    const existing = await getArenaSidecarTokenSelection(currentEpochId, agentId, undefined, networkId);
    const pick = picks[agentId].token;

    if (existing?.recorded) {
      actions.push({
        agentId,
        action: "skipped",
        tokenSymbol: existing.tokenSymbol,
        tokenAddress: existing.tokenAddress,
      });
      continue;
    }

    if (!pick.priceUsd || pick.priceUsd <= 0) {
      throw new Error(`Missing priceUsd for agent ${agentId} token ${pick.symbol}.`);
    }

    try {
      const txHash = await recordArenaTokenSelection(walletClient, {
        epochId: currentEpochId,
        agentId,
        tokenAddress: pick.address,
        tokenSymbol: pick.symbol,
        startPriceUsdE8: toE8(pick.priceUsd),
        startVolume24h: toUint(pick.volume24h),
        startHolderCount: toUint(pick.holderCount),
        startLiquidityUsd: toUint(pick.liquidityUsd),
        startTxCount24h: toUint(pick.txCount24h),
      }, networkId);

      actions.push({
        agentId,
        action: "recorded",
        tokenSymbol: pick.symbol,
        tokenAddress: pick.address,
        txHash,
      });
    } catch (error) {
      if (includesErrorName(error, "SelectionAlreadyRecorded")) {
        actions.push({
          agentId,
          action: "skipped",
          tokenSymbol: pick.symbol,
          tokenAddress: pick.address,
        });
        continue;
      }

      throw error;
    }
  }

  return {
    epochId: Number(currentEpochId),
    actions,
  };
}

export async function syncArenaEpochFinalize(
  epochIdInput?: bigint | number,
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
) {
  if (!isArenaSidecarConfiguredForNetwork(networkId)) {
    throw new Error("Arena sidecar is not configured.");
  }

  const currentEpochId = await getArenaSidecarCurrentEpochId(undefined, networkId);
  if (currentEpochId === null) {
    throw new Error("Unable to read current arena epoch.");
  }

  const targetEpochId =
    typeof epochIdInput !== "undefined"
      ? BigInt(epochIdInput)
      : currentEpochId > 0n
        ? currentEpochId - 1n
        : 0n;

  const isOpen = await isArenaSidecarEpochOpen(targetEpochId, undefined, networkId);
  if (isOpen === null) {
    return {
      epochId: Number(targetEpochId),
      action: "skipped",
      reason: "open_state_unavailable",
    };
  }

  if (isOpen) {
    return {
      epochId: Number(targetEpochId),
      action: "skipped",
      reason: "epoch_still_open",
    };
  }

  const existingResult = await getArenaSidecarEpochResult(targetEpochId, undefined, networkId);
  if (existingResult?.finalized) {
    const progression = await applyArenaEpochProgressionIfNeeded(targetEpochId, existingResult.winnerAgentId);
    return {
      epochId: Number(targetEpochId),
      action: "skipped",
      reason: "already_finalized",
      winnerAgentId: existingResult.winnerAgentId,
      progression,
    };
  }

  const rawSelections = await Promise.all(
    AGENT_IDS.map(async (agentId) => ({
      agentId,
      selection: await getArenaSidecarTokenSelection(targetEpochId, agentId, undefined, networkId),
    })),
  );
  const missingAgentIds = rawSelections
    .filter((entry) => !entry.selection?.recorded)
    .map((entry) => entry.agentId);

  if (missingAgentIds.length > 0) {
    return {
      epochId: Number(targetEpochId),
      action: "skipped",
      reason: "incomplete_selections",
      missingAgentIds,
    };
  }

  const selections = rawSelections as Array<{
    agentId: (typeof AGENT_IDS)[number];
    selection: NonNullable<(typeof rawSelections)[number]["selection"]>;
  }>;

  const metricsByAddress = await getLiveArenaTokenMetrics(
    selections.map((entry) => entry.selection.tokenAddress),
  );

  const finalPriceUsdE8 = [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
  const finalVolume24h = [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
  const finalHolderCount = [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
  const finalLiquidityUsd = [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
  const finalTxCount24h = [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];

  selections.forEach(({ agentId, selection }) => {
    const metrics = metricsByAddress[selection.tokenAddress.toLowerCase()];
    const livePriceUsdE8 = toE8(metrics?.priceUsd ?? 0);
    const liveVolume24h = toUint(metrics?.volume24h ?? 0);
    const liveHolderCount = toUint(metrics?.holderCount ?? 0);
    const liveLiquidityUsd = toUint(metrics?.liquidityUsd ?? 0);
    const liveTxCount24h = toUint(metrics?.txCount24h ?? 0);

    finalPriceUsdE8[agentId] = livePriceUsdE8 > 0n ? livePriceUsdE8 : selection.startPriceUsdE8;
    finalVolume24h[agentId] = liveVolume24h > 0n ? liveVolume24h : selection.startVolume24h;
    finalHolderCount[agentId] = liveHolderCount > 0n ? liveHolderCount : selection.startHolderCount;
    finalLiquidityUsd[agentId] = liveLiquidityUsd > 0n ? liveLiquidityUsd : selection.startLiquidityUsd;
    finalTxCount24h[agentId] = liveTxCount24h > 0n ? liveTxCount24h : selection.startTxCount24h;
  });

  const walletClient = getArenaOracleWalletClient(networkId);
  const txHash = await finalizeArenaEpoch(walletClient, {
    epochId: targetEpochId,
    finalPriceUsdE8,
    finalVolume24h,
    finalHolderCount,
    finalLiquidityUsd,
    finalTxCount24h,
  }, networkId).catch((error) => {
    if (includesErrorName(error, "EpochAlreadyFinalized")) {
      return null;
    }

    throw error;
  });

  if (txHash === null) {
    const progression = existingResult
      ? await applyArenaEpochProgressionIfNeeded(targetEpochId, existingResult.winnerAgentId)
      : null;
    return {
      epochId: Number(targetEpochId),
      action: "skipped",
      reason: "already_finalized",
      winnerAgentId: existingResult?.winnerAgentId ?? null,
      progression,
    };
  }

  let progression:
    | Awaited<ReturnType<typeof applyArenaEpochProgressionIfNeeded>>
    | null = null;

  try {
    const network = getArenaNetworkConfig(networkId);
    const publicClient = createPublicClient({
      chain: network.chain,
      transport: getArenaNetworkTransport(networkId),
    });

    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
      timeout: 30_000,
    });

    const finalizedResult = await getArenaSidecarEpochResult(targetEpochId, publicClient, networkId);
    if (finalizedResult?.finalized) {
      progression = await applyArenaEpochProgressionIfNeeded(targetEpochId, finalizedResult.winnerAgentId);
    }
  } catch {
    progression = null;
  }

  return {
    epochId: Number(targetEpochId),
    action: "finalized",
    txHash,
    progression,
    metrics: selections.map(({ agentId, selection }) => ({
      agentId,
      tokenSymbol: selection.tokenSymbol,
      tokenAddress: selection.tokenAddress,
      finalPriceUsdE8: finalPriceUsdE8[agentId].toString(),
      finalVolume24h: finalVolume24h[agentId].toString(),
      finalHolderCount: finalHolderCount[agentId].toString(),
      finalLiquidityUsd: finalLiquidityUsd[agentId].toString(),
      finalTxCount24h: finalTxCount24h[agentId].toString(),
    })),
  };
}
