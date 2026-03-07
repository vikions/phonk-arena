import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface TokenSnapshotPoint {
  timestamp: number;
  holderCount: number;
}

interface TokenSnapshotEntry {
  symbol: string;
  name: string;
  snapshots: TokenSnapshotPoint[];
}

interface TokenSnapshotState {
  tokens: Record<string, TokenSnapshotEntry>;
}

interface SnapshotInput {
  address: string;
  symbol: string;
  name: string;
  holderCount: number;
}

const SNAPSHOT_FILE_NAME = "phonk-arena-token-holder-snapshots.json";
const SNAPSHOT_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;

function snapshotFilePath(): string {
  return path.join(os.tmpdir(), SNAPSHOT_FILE_NAME);
}

function defaultState(): TokenSnapshotState {
  return {
    tokens: {},
  };
}

async function loadState(): Promise<TokenSnapshotState> {
  try {
    const raw = await fs.readFile(snapshotFilePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<TokenSnapshotState>;
    if (!parsed || typeof parsed !== "object" || !parsed.tokens || typeof parsed.tokens !== "object") {
      return defaultState();
    }

    const tokens: Record<string, TokenSnapshotEntry> = {};
    for (const [address, entry] of Object.entries(parsed.tokens)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const normalizedAddress = address.toLowerCase();
      const symbol = typeof (entry as { symbol?: unknown }).symbol === "string" ? (entry as { symbol: string }).symbol : "";
      const name = typeof (entry as { name?: unknown }).name === "string" ? (entry as { name: string }).name : "";
      const snapshotsRaw = Array.isArray((entry as { snapshots?: unknown[] }).snapshots)
        ? ((entry as { snapshots: unknown[] }).snapshots as unknown[])
        : [];

      const snapshots = snapshotsRaw
        .map((point) => {
          if (!point || typeof point !== "object") {
            return null;
          }

          const maybe = point as { timestamp?: unknown; holderCount?: unknown };
          return typeof maybe.timestamp === "number" && typeof maybe.holderCount === "number"
            ? { timestamp: maybe.timestamp, holderCount: maybe.holderCount }
            : null;
        })
        .filter((point): point is TokenSnapshotPoint => point !== null);

      tokens[normalizedAddress] = {
        symbol,
        name,
        snapshots,
      };
    }

    return { tokens };
  } catch {
    return defaultState();
  }
}

async function writeState(state: TokenSnapshotState): Promise<void> {
  await fs.writeFile(snapshotFilePath(), JSON.stringify(state), "utf8");
}

function pruneSnapshots(points: TokenSnapshotPoint[], nowMs: number): TokenSnapshotPoint[] {
  return points.filter((point) => nowMs - point.timestamp <= SNAPSHOT_RETENTION_MS);
}

function findSnapshotAtLeast24hAgo(points: TokenSnapshotPoint[], nowMs: number): TokenSnapshotPoint | null {
  const targetTimestamp = nowMs - 24 * 60 * 60 * 1000;
  let best: TokenSnapshotPoint | null = null;

  for (const point of points) {
    if (point.timestamp > targetTimestamp) {
      continue;
    }

    if (!best || point.timestamp > best.timestamp) {
      best = point;
    }
  }

  return best;
}

export async function updateHolderSnapshots(
  tokens: SnapshotInput[],
  nowMs = Date.now(),
): Promise<Record<string, number | null>> {
  const state = await loadState();
  const holderDeltaByAddress: Record<string, number | null> = {};
  let changed = false;

  for (const token of tokens) {
    const address = token.address.toLowerCase();
    if (!address) {
      continue;
    }

    const entry = state.tokens[address] ?? {
      symbol: token.symbol,
      name: token.name,
      snapshots: [],
    };

    entry.symbol = token.symbol;
    entry.name = token.name;
    entry.snapshots = pruneSnapshots(entry.snapshots, nowMs);

    const previous24hSnapshot = findSnapshotAtLeast24hAgo(entry.snapshots, nowMs);
    holderDeltaByAddress[address] =
      previous24hSnapshot !== null ? token.holderCount - previous24hSnapshot.holderCount : null;

    const latestSnapshot = entry.snapshots[entry.snapshots.length - 1] ?? null;
    const shouldAppend =
      latestSnapshot === null ||
      nowMs - latestSnapshot.timestamp >= SNAPSHOT_INTERVAL_MS ||
      latestSnapshot.holderCount !== token.holderCount;

    if (shouldAppend) {
      entry.snapshots.push({
        timestamp: nowMs,
        holderCount: token.holderCount,
      });
      changed = true;
    }

    state.tokens[address] = entry;
  }

  if (changed) {
    await writeState(state);
  }

  return holderDeltaByAddress;
}
