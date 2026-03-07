import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import postgres from "postgres";

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

type SnapshotBackend = "postgres" | "file";

interface SnapshotRow {
  token_address: string;
  holder_count: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_POSTGRES_CLIENT__: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_TOKEN_SNAPSHOT_SCHEMA_PROMISE__: Promise<void> | undefined;
}

const SNAPSHOT_FILE_NAME = "phonk-arena-token-holder-snapshots.json";
const SNAPSHOT_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function snapshotFilePath(): string {
  return path.join(os.tmpdir(), SNAPSHOT_FILE_NAME);
}

function defaultState(): TokenSnapshotState {
  return {
    tokens: {},
  };
}

function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
}

export function getSnapshotBackend(): SnapshotBackend {
  return getDatabaseUrl() ? "postgres" : "file";
}

function getPostgresClient(): ReturnType<typeof postgres> | null {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }

  if (!global.__PHONK_ARENA_POSTGRES_CLIENT__) {
    global.__PHONK_ARENA_POSTGRES_CLIENT__ = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }

  return global.__PHONK_ARENA_POSTGRES_CLIENT__;
}

async function ensurePostgresSchema(sql: ReturnType<typeof postgres>): Promise<void> {
  if (!global.__PHONK_ARENA_TOKEN_SNAPSHOT_SCHEMA_PROMISE__) {
    global.__PHONK_ARENA_TOKEN_SNAPSHOT_SCHEMA_PROMISE__ = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS token_holder_snapshots (
          token_address TEXT NOT NULL,
          snapshot_hour TIMESTAMPTZ NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          holder_count INTEGER NOT NULL,
          recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (token_address, snapshot_hour)
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS token_holder_snapshots_lookup_idx
        ON token_holder_snapshots (token_address, snapshot_hour DESC)
      `;
    })();
  }

  await global.__PHONK_ARENA_TOKEN_SNAPSHOT_SCHEMA_PROMISE__;
}

async function loadFileState(): Promise<TokenSnapshotState> {
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
      const symbol =
        typeof (entry as { symbol?: unknown }).symbol === "string"
          ? (entry as { symbol: string }).symbol
          : "";
      const name =
        typeof (entry as { name?: unknown }).name === "string"
          ? (entry as { name: string }).name
          : "";
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

async function writeFileState(state: TokenSnapshotState): Promise<void> {
  await fs.writeFile(snapshotFilePath(), JSON.stringify(state), "utf8");
}

function pruneSnapshots(points: TokenSnapshotPoint[], nowMs: number): TokenSnapshotPoint[] {
  return points.filter((point) => nowMs - point.timestamp <= SNAPSHOT_RETENTION_MS);
}

function findSnapshotAtLeast24hAgo(points: TokenSnapshotPoint[], nowMs: number): TokenSnapshotPoint | null {
  const targetTimestamp = nowMs - DAY_MS;
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

function startOfHour(nowMs: number): Date {
  return new Date(Math.floor(nowMs / SNAPSHOT_INTERVAL_MS) * SNAPSHOT_INTERVAL_MS);
}

async function updateFileSnapshots(
  tokens: SnapshotInput[],
  nowMs: number,
): Promise<Record<string, number | null>> {
  const state = await loadFileState();
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
    await writeFileState(state);
  }

  return holderDeltaByAddress;
}

async function updatePostgresSnapshots(
  tokens: SnapshotInput[],
  nowMs: number,
): Promise<Record<string, number | null>> {
  const sql = getPostgresClient();
  if (!sql) {
    return updateFileSnapshots(tokens, nowMs);
  }

  await ensurePostgresSchema(sql);

  const normalizedTokens = tokens
    .map((token) => ({
      ...token,
      address: token.address.toLowerCase(),
    }))
    .filter((token) => token.address.length > 0);

  const holderDeltaByAddress: Record<string, number | null> = {};
  if (normalizedTokens.length === 0) {
    return holderDeltaByAddress;
  }

  const addresses = normalizedTokens.map((token) => token.address);
  const targetDate = new Date(nowMs - DAY_MS);
  const snapshotHour = startOfHour(nowMs);

  const previousRows = await sql<SnapshotRow[]>`
    SELECT DISTINCT ON (token_address)
      token_address,
      holder_count
    FROM token_holder_snapshots
    WHERE token_address = ANY(${sql.array(addresses)})
      AND snapshot_hour <= ${targetDate}
    ORDER BY token_address, snapshot_hour DESC
  `;

  const previousCountByAddress = new Map(previousRows.map((row) => [row.token_address.toLowerCase(), row.holder_count]));

  for (const token of normalizedTokens) {
    const previousCount = previousCountByAddress.get(token.address);
    holderDeltaByAddress[token.address] =
      typeof previousCount === "number" ? token.holderCount - previousCount : null;
  }

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof postgres>;

    for (const token of normalizedTokens) {
      await tx`
        INSERT INTO token_holder_snapshots (
          token_address,
          snapshot_hour,
          symbol,
          name,
          holder_count
        ) VALUES (
          ${token.address},
          ${snapshotHour},
          ${token.symbol},
          ${token.name},
          ${token.holderCount}
        )
        ON CONFLICT (token_address, snapshot_hour)
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          name = EXCLUDED.name,
          holder_count = EXCLUDED.holder_count,
          recorded_at = NOW()
      `;
    }

    await tx`
      DELETE FROM token_holder_snapshots
      WHERE snapshot_hour < ${new Date(nowMs - SNAPSHOT_RETENTION_MS)}
    `;
  });

  return holderDeltaByAddress;
}

export async function updateHolderSnapshots(
  tokens: SnapshotInput[],
  nowMs = Date.now(),
): Promise<Record<string, number | null>> {
  if (getSnapshotBackend() === "postgres") {
    return updatePostgresSnapshots(tokens, nowMs);
  }

  return updateFileSnapshots(tokens, nowMs);
}
