import type { Address, Hash, PublicClient } from "viem";
import { createPublicClient, formatEther, parseAbiItem } from "viem";

import {
  type ArenaNetworkId,
  DEFAULT_ARENA_NETWORK_ID,
  getArenaNetworkConfig,
  getArenaNetworkId,
  getArenaNetworkTransport,
} from "@/lib/arenaNetworks";
import {
  getArenaSidecarAddress,
  getArenaSidecarConfigError,
  getArenaSidecarCurrentEpochId,
  getArenaSidecarEpochPool,
  isArenaSidecarEpochOpen,
} from "@/lib/arenaSidecar";
import type { OnchainTractionSummary, RecentOnchainBet } from "@/lib/onchainTractionTypes";

const BET_PLACED_EVENT = parseAbiItem(
  "event BetPlaced(uint256 indexed epochId, address indexed user, uint8 indexed agentId, uint256 amount)",
);

const CACHE_TTL_MS = 60_000;
const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const DEFAULT_LOG_CHUNK_BLOCKS = 25_000n;
const MIN_LOG_CHUNK_BLOCKS = 1_000n;
const RECENT_BET_LIMIT = 6;

let cachedSummary:
  | {
      cacheKey: string;
      createdAt: number;
      summary: OnchainTractionSummary;
    }
  | null = null;

type BetPlacedLog = Awaited<ReturnType<PublicClient["getLogs"]>>[number] & {
  args?: {
    epochId?: bigint;
    user?: Address;
    agentId?: number | bigint;
    amount?: bigint;
  };
  transactionHash?: Hash;
  blockNumber?: bigint;
  logIndex?: number;
};

function readPositiveBigIntEnv(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = BigInt(raw);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatEthAmount(value: bigint): string {
  const numeric = Number(formatEther(value));

  if (!Number.isFinite(numeric)) {
    return formatEther(value);
  }

  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: 8,
  });
}

function emptySummary(networkId: ArenaNetworkId, error?: string): OnchainTractionSummary {
  const network = getArenaNetworkConfig(networkId);
  const contractAddress = getArenaSidecarAddress(networkId);

  return {
    enabled: false,
    source: "onchain",
    generatedAt: new Date().toISOString(),
    networkLabel: network.label,
    explorerUrl: network.explorerUrl,
    contractAddress,
    currentEpochId: null,
    currentEpochOpen: null,
    currentEpochPoolEth: "0",
    currentEpochBettors: 0,
    bets24h: 0,
    activeBettors24h: 0,
    volume24hEth: "0",
    bets7d: 0,
    activeBettors7d: 0,
    repeatBettors7d: 0,
    volume7dEth: "0",
    latestBlock: null,
    scannedFromBlock: null,
    recentBets: [],
    error,
  };
}

function compareLogsDesc(left: BetPlacedLog, right: BetPlacedLog): number {
  const leftBlock = left.blockNumber ?? 0n;
  const rightBlock = right.blockNumber ?? 0n;

  if (leftBlock > rightBlock) {
    return -1;
  }

  if (leftBlock < rightBlock) {
    return 1;
  }

  return (right.logIndex ?? 0) - (left.logIndex ?? 0);
}

async function findBlockAtOrBeforeTimestamp(
  publicClient: PublicClient,
  targetTimestamp: bigint,
  latestBlockNumber: bigint,
): Promise<bigint> {
  let low = 0n;
  let high = latestBlockNumber;

  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    const block = await publicClient.getBlock({ blockNumber: mid });
    const timestamp = BigInt(block.timestamp);

    if (timestamp <= targetTimestamp) {
      low = mid;
    } else {
      high = mid - 1n;
    }
  }

  return low;
}

async function getBetPlacedLogs(
  publicClient: PublicClient,
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<BetPlacedLog[]> {
  const logs: BetPlacedLog[] = [];
  let chunkSize = readPositiveBigIntEnv("ONCHAIN_TRACTION_LOG_CHUNK_BLOCKS", DEFAULT_LOG_CHUNK_BLOCKS);
  let start = fromBlock;

  while (start <= toBlock) {
    const end = start + chunkSize - 1n < toBlock ? start + chunkSize - 1n : toBlock;

    try {
      const chunkLogs = await publicClient.getLogs({
        address,
        event: BET_PLACED_EVENT,
        fromBlock: start,
        toBlock: end,
      });

      logs.push(...(chunkLogs as BetPlacedLog[]));
      start = end + 1n;
    } catch (error) {
      if (chunkSize <= MIN_LOG_CHUNK_BLOCKS) {
        throw error;
      }

      chunkSize /= 2n;
    }
  }

  return logs;
}

function sumBetAmounts(logs: BetPlacedLog[]): bigint {
  return logs.reduce((total, log) => total + (log.args?.amount ?? 0n), 0n);
}

function uniqueBettors(logs: BetPlacedLog[]): Set<string> {
  return new Set(logs.map((log) => log.args?.user?.toLowerCase()).filter((user): user is string => Boolean(user)));
}

function repeatBettorCount(logs: BetPlacedLog[]): number {
  const counts = new Map<string, number>();

  for (const log of logs) {
    const user = log.args?.user?.toLowerCase();
    if (!user) {
      continue;
    }

    counts.set(user, (counts.get(user) ?? 0) + 1);
  }

  return [...counts.values()].filter((count) => count >= 2).length;
}

async function buildRecentBets(publicClient: PublicClient, logs: BetPlacedLog[]): Promise<RecentOnchainBet[]> {
  const recentLogs = [...logs].sort(compareLogsDesc).slice(0, RECENT_BET_LIMIT);
  const blockNumbers = [...new Set(recentLogs.map((log) => log.blockNumber).filter((value): value is bigint => Boolean(value)))];
  const blockTimes = new Map<string, string>();

  await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      try {
        const block = await publicClient.getBlock({ blockNumber });
        blockTimes.set(blockNumber.toString(), new Date(Number(block.timestamp) * 1000).toISOString());
      } catch {
        blockTimes.set(blockNumber.toString(), "");
      }
    }),
  );

  return recentLogs.map((log) => {
    const blockNumber = log.blockNumber ?? 0n;

    return {
      txHash: log.transactionHash ?? "",
      walletAddress: log.args?.user ?? "",
      epochId: (log.args?.epochId ?? 0n).toString(),
      agentId: Number(log.args?.agentId ?? 0),
      amountEth: formatEthAmount(log.args?.amount ?? 0n),
      blockNumber: blockNumber.toString(),
      createdAt: blockTimes.get(blockNumber.toString()) || null,
    };
  });
}

export async function getOnchainTractionSummary(
  rawNetworkId?: string | null,
): Promise<OnchainTractionSummary> {
  const networkId = getArenaNetworkId(rawNetworkId ?? DEFAULT_ARENA_NETWORK_ID);
  const cacheKey = networkId;

  if (cachedSummary?.cacheKey === cacheKey && Date.now() - cachedSummary.createdAt < CACHE_TTL_MS) {
    return cachedSummary.summary;
  }

  const configError = getArenaSidecarConfigError(networkId);
  if (configError) {
    return emptySummary(networkId, configError);
  }

  try {
    const network = getArenaNetworkConfig(networkId);
    const contractAddress = getArenaSidecarAddress(networkId);
    const publicClient = createPublicClient({
      chain: network.chain,
      transport: getArenaNetworkTransport(networkId),
    });

    const latestBlock = await publicClient.getBlock();
    const latestBlockNumber = latestBlock.number ?? (await publicClient.getBlockNumber());
    const latestTimestamp = BigInt(latestBlock.timestamp);
    const from24hBlock = await findBlockAtOrBeforeTimestamp(
      publicClient,
      latestTimestamp - BigInt(DAY_SECONDS),
      latestBlockNumber,
    );
    const from7dBlock = await findBlockAtOrBeforeTimestamp(
      publicClient,
      latestTimestamp - BigInt(WEEK_SECONDS),
      latestBlockNumber,
    );
    const logs7d = await getBetPlacedLogs(publicClient, contractAddress, from7dBlock, latestBlockNumber);
    const logs24h = logs7d.filter((log) => (log.blockNumber ?? 0n) >= from24hBlock);

    const currentEpochId = await getArenaSidecarCurrentEpochId(publicClient, networkId);
    const [currentEpochOpen, currentEpochPool] =
      currentEpochId === null
        ? [null, null]
        : await Promise.all([
            isArenaSidecarEpochOpen(currentEpochId, publicClient, networkId),
            getArenaSidecarEpochPool(currentEpochId, publicClient, networkId),
          ]);

    const currentEpochLogs =
      currentEpochId === null
        ? []
        : logs7d.filter((log) => (log.args?.epochId ?? -1n) === currentEpochId);

    const summary: OnchainTractionSummary = {
      enabled: true,
      source: "onchain",
      generatedAt: new Date().toISOString(),
      networkLabel: network.label,
      explorerUrl: network.explorerUrl,
      contractAddress,
      currentEpochId: currentEpochId?.toString() ?? null,
      currentEpochOpen,
      currentEpochPoolEth: formatEthAmount(currentEpochPool?.totalPool ?? sumBetAmounts(currentEpochLogs)),
      currentEpochBettors: uniqueBettors(currentEpochLogs).size,
      bets24h: logs24h.length,
      activeBettors24h: uniqueBettors(logs24h).size,
      volume24hEth: formatEthAmount(sumBetAmounts(logs24h)),
      bets7d: logs7d.length,
      activeBettors7d: uniqueBettors(logs7d).size,
      repeatBettors7d: repeatBettorCount(logs7d),
      volume7dEth: formatEthAmount(sumBetAmounts(logs7d)),
      latestBlock: latestBlockNumber.toString(),
      scannedFromBlock: from7dBlock.toString(),
      recentBets: await buildRecentBets(publicClient, logs7d),
    };

    cachedSummary = {
      cacheKey,
      createdAt: Date.now(),
      summary,
    };

    return summary;
  } catch (error) {
    return emptySummary(
      networkId,
      error instanceof Error ? error.message : "Failed to read onchain traction metrics.",
    );
  }
}
