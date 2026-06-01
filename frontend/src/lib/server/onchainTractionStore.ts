import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Address, PublicClient } from "viem";
import { createPublicClient, parseAbiItem } from "viem";

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
  isArenaSidecarEpochOpen,
} from "@/lib/arenaSidecar";
import type { OnchainTractionSummary } from "@/lib/onchainTractionTypes";

const BET_PLACED_EVENT = parseAbiItem(
  "event BetPlaced(uint256 indexed epochId, address indexed user, uint8 indexed agentId, uint256 amount)",
);

const CACHE_TTL_MS = 60_000;
const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const DEFAULT_LOG_CHUNK_BLOCKS = 100_000n;
const MIN_LOG_CHUNK_BLOCKS = 1_000n;

let cachedSummary:
  | {
      cacheKey: string;
      createdAt: number;
      summary: OnchainTractionSummary;
    }
  | null = null;

const refreshPromises = new Map<string, Promise<void>>();

type BetPlacedLog = Awaited<ReturnType<PublicClient["getLogs"]>>[number] & {
  args?: {
    epochId?: bigint;
    user?: Address;
    agentId?: number | bigint;
    amount?: bigint;
  };
  blockNumber?: bigint;
};

function getCacheFilePath(networkId: ArenaNetworkId): string {
  return path.join(os.tmpdir(), `phonk-arena-onchain-traction-${networkId}.json`);
}

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

function isCachedSummary(value: unknown): value is OnchainTractionSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return record.source === "onchain" && typeof record.generatedAt === "string";
}

async function readPersistedSummary(networkId: ArenaNetworkId): Promise<OnchainTractionSummary | null> {
  try {
    const raw = await fs.readFile(getCacheFilePath(networkId), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    return isCachedSummary(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function persistSummary(networkId: ArenaNetworkId, summary: OnchainTractionSummary): Promise<void> {
  try {
    await fs.writeFile(getCacheFilePath(networkId), `${JSON.stringify(summary)}\n`, "utf8");
  } catch {
    // The dashboard can still use in-memory cache if the deployment filesystem is read-only.
  }
}

function rememberSummary(networkId: ArenaNetworkId, cacheKey: string, summary: OnchainTractionSummary): void {
  cachedSummary = {
    cacheKey,
    createdAt: Date.now(),
    summary,
  };

  void persistSummary(networkId, summary);
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

async function buildOnchainTractionSummary(networkId: ArenaNetworkId): Promise<OnchainTractionSummary> {
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
    const currentEpochOpen =
      currentEpochId === null
        ? null
        : await isArenaSidecarEpochOpen(currentEpochId, publicClient, networkId);

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
      currentEpochPoolEth: "0",
      currentEpochBettors: uniqueBettors(currentEpochLogs).size,
      bets24h: logs24h.length,
      activeBettors24h: uniqueBettors(logs24h).size,
      volume24hEth: "0",
      bets7d: logs7d.length,
      activeBettors7d: uniqueBettors(logs7d).size,
      repeatBettors7d: repeatBettorCount(logs7d),
      volume7dEth: "0",
      latestBlock: latestBlockNumber.toString(),
      scannedFromBlock: from7dBlock.toString(),
      recentBets: [],
    };

    return summary;
  } catch (error) {
    return emptySummary(
      networkId,
      error instanceof Error ? error.message : "Failed to read onchain traction metrics.",
    );
  }
}

function refreshSummaryInBackground(networkId: ArenaNetworkId, cacheKey: string): void {
  if (refreshPromises.has(cacheKey)) {
    return;
  }

  const refreshPromise = buildOnchainTractionSummary(networkId)
    .then((summary) => {
      if (summary.enabled) {
        rememberSummary(networkId, cacheKey, summary);
      }
    })
    .finally(() => {
      refreshPromises.delete(cacheKey);
    });

  refreshPromises.set(cacheKey, refreshPromise);
}

export async function getOnchainTractionSummary(
  rawNetworkId?: string | null,
): Promise<OnchainTractionSummary> {
  const networkId = getArenaNetworkId(rawNetworkId ?? DEFAULT_ARENA_NETWORK_ID);
  const cacheKey = networkId;

  if (cachedSummary?.cacheKey === cacheKey) {
    if (Date.now() - cachedSummary.createdAt >= CACHE_TTL_MS) {
      refreshSummaryInBackground(networkId, cacheKey);
    }

    return cachedSummary.summary;
  }

  const persistedSummary = await readPersistedSummary(networkId);
  if (persistedSummary) {
    cachedSummary = {
      cacheKey,
      createdAt: 0,
      summary: persistedSummary,
    };
    refreshSummaryInBackground(networkId, cacheKey);

    return persistedSummary;
  }

  const summary = await buildOnchainTractionSummary(networkId);
  if (summary.enabled) {
    rememberSummary(networkId, cacheKey, summary);
  }

  return summary;
}
