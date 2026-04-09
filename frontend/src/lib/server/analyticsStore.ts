import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import postgres from "postgres";

import type {
  AnalyticsEventName,
  AnalyticsTrackPayload,
  RecentTransactionActivity,
  TractionSummary,
} from "@/lib/analyticsTypes";

interface StoredAnalyticsEvent {
  eventKey: string;
  eventName: AnalyticsEventName;
  sessionId: string;
  path: string | null;
  walletAddress: string | null;
  txHash: string | null;
  lobbyId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

interface AnalyticsFileState {
  events: StoredAnalyticsEvent[];
}

interface AnalyticsEventRow {
  event_key: string;
  event_name: AnalyticsEventName;
  session_id: string;
  path: string | null;
  wallet_address: string | null;
  tx_hash: string | null;
  lobby_id: string | null;
  metadata: Record<string, string | number | boolean | null> | null;
  created_at: Date | string;
}

type AnalyticsBackend = "postgres" | "file";

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_ANALYTICS_POSTGRES_CLIENT__: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_ANALYTICS_SCHEMA_PROMISE__: Promise<void> | undefined;
}

const FILE_PATH = path.join(os.tmpdir(), "phonk-arena-analytics.json");
const MAX_FILE_EVENTS = 12_000;
const RETENTION_MS = 35 * 24 * 60 * 60 * 1000;

function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
}

function getBackend(): AnalyticsBackend {
  return getDatabaseUrl() ? "postgres" : "file";
}

function getPostgresClient(): ReturnType<typeof postgres> | null {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    return null;
  }

  if (!global.__PHONK_ARENA_ANALYTICS_POSTGRES_CLIENT__) {
    global.__PHONK_ARENA_ANALYTICS_POSTGRES_CLIENT__ = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
    });
  }

  return global.__PHONK_ARENA_ANALYTICS_POSTGRES_CLIENT__;
}

async function ensureSchema(sql: ReturnType<typeof postgres>): Promise<void> {
  if (!global.__PHONK_ARENA_ANALYTICS_SCHEMA_PROMISE__) {
    global.__PHONK_ARENA_ANALYTICS_SCHEMA_PROMISE__ = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS analytics_events (
          id BIGSERIAL PRIMARY KEY,
          event_key TEXT NOT NULL UNIQUE,
          event_name TEXT NOT NULL,
          session_id TEXT NOT NULL,
          path TEXT,
          wallet_address TEXT,
          tx_hash TEXT,
          lobby_id TEXT,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx ON analytics_events (event_name)`;
      await sql`CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx ON analytics_events (session_id)`;
      await sql`CREATE INDEX IF NOT EXISTS analytics_events_wallet_address_idx ON analytics_events (wallet_address)`;
      await sql`CREATE INDEX IF NOT EXISTS analytics_events_tx_hash_idx ON analytics_events (tx_hash)`;
    })();
  }

  await global.__PHONK_ARENA_ANALYTICS_SCHEMA_PROMISE__;
}

function normalizeText(value: string | undefined, limit: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, limit);
}

function normalizeMetadata(
  value: AnalyticsTrackPayload["metadata"],
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value).slice(0, 20);
  return Object.fromEntries(
    entries.map(([key, entryValue]) => [key.slice(0, 64), entryValue]),
  );
}

function buildStoredEvent(payload: AnalyticsTrackPayload): StoredAnalyticsEvent {
  const now = new Date().toISOString();
  const eventKey =
    normalizeText(payload.eventKey, 200) ||
    `${payload.eventName}:${payload.sessionId || "unknown"}:${Date.now().toString(36)}`;

  return {
    eventKey,
    eventName: payload.eventName,
    sessionId: normalizeText(payload.sessionId, 120) || "anonymous",
    path: normalizeText(payload.path, 180),
    walletAddress: normalizeText(payload.walletAddress?.toLowerCase(), 80),
    txHash: normalizeText(payload.txHash?.toLowerCase(), 100),
    lobbyId: normalizeText(payload.lobbyId, 80),
    metadata: normalizeMetadata(payload.metadata),
    createdAt: now,
  };
}

async function readFileState(): Promise<AnalyticsFileState> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as AnalyticsFileState;
    return Array.isArray(parsed.events) ? parsed : { events: [] };
  } catch {
    return { events: [] };
  }
}

async function writeFileState(state: AnalyticsFileState): Promise<void> {
  await fs.writeFile(FILE_PATH, JSON.stringify(state), "utf8");
}

function pruneEvents(events: StoredAnalyticsEvent[], nowMs: number): StoredAnalyticsEvent[] {
  const cutoff = nowMs - RETENTION_MS;
  return events
    .filter((event) => new Date(event.createdAt).getTime() >= cutoff)
    .slice(-MAX_FILE_EVENTS);
}

export async function trackAnalyticsEvent(payload: AnalyticsTrackPayload): Promise<void> {
  const event = buildStoredEvent(payload);
  const backend = getBackend();

  if (backend === "postgres") {
    const sql = getPostgresClient();
    if (!sql) {
      return;
    }

    await ensureSchema(sql);
    await sql`
      INSERT INTO analytics_events (
        event_key,
        event_name,
        session_id,
        path,
        wallet_address,
        tx_hash,
        lobby_id,
        metadata,
        created_at
      ) VALUES (
        ${event.eventKey},
        ${event.eventName},
        ${event.sessionId},
        ${event.path},
        ${event.walletAddress},
        ${event.txHash},
        ${event.lobbyId},
        ${sql.json(event.metadata)},
        ${event.createdAt}
      )
      ON CONFLICT (event_key) DO NOTHING
    `;
    return;
  }

  const state = await readFileState();
  if (state.events.some((entry) => entry.eventKey === event.eventKey)) {
    return;
  }

  state.events.push(event);
  state.events = pruneEvents(state.events, Date.now());
  await writeFileState(state);
}

function toStoredEvent(row: AnalyticsEventRow): StoredAnalyticsEvent {
  return {
    eventKey: row.event_key,
    eventName: row.event_name,
    sessionId: row.session_id,
    path: row.path,
    walletAddress: row.wallet_address,
    txHash: row.tx_hash,
    lobbyId: row.lobby_id,
    metadata: row.metadata ?? {},
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

function emptySummary(backend: AnalyticsBackend, liveListeners: number): TractionSummary {
  return {
    enabled: true,
    backend,
    generatedAt: new Date().toISOString(),
    liveListeners,
    pageViews24h: 0,
    uniqueSessions24h: 0,
    battleSessions24h: 0,
    uniqueWallets24h: 0,
    submittedTransactions24h: 0,
    confirmedTransactions24h: 0,
    repeatSessions7d: 0,
    recentTransactions: [],
  };
}

function summarizeEvents(
  events: StoredAnalyticsEvent[],
  backend: AnalyticsBackend,
  liveListeners: number,
): TractionSummary {
  const summary = emptySummary(backend, liveListeners);
  const nowMs = Date.now();
  const dayAgo = nowMs - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;

  const pageViewNames = new Set<AnalyticsEventName>(["landing_view", "foyer_view", "battle_view"]);
  const submittedNames = new Set<AnalyticsEventName>(["bet_submitted", "claim_submitted"]);
  const confirmedNames = new Set<AnalyticsEventName>(["bet_confirmed", "claim_confirmed"]);

  const sessions24h = new Set<string>();
  const battleSessions24h = new Set<string>();
  const wallets24h = new Set<string>();
  const submittedTx24h = new Set<string>();
  const confirmedTx24h = new Set<string>();
  const recentTransactions = new Map<string, RecentTransactionActivity>();
  const sessionDays7d = new Map<string, Set<string>>();

  for (const event of events) {
    const createdAtMs = new Date(event.createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }

    if (createdAtMs >= sevenDaysAgo) {
      const sessionDays = sessionDays7d.get(event.sessionId) ?? new Set<string>();
      sessionDays.add(new Date(createdAtMs).toISOString().slice(0, 10));
      sessionDays7d.set(event.sessionId, sessionDays);
    }

    if (createdAtMs < dayAgo) {
      continue;
    }

    sessions24h.add(event.sessionId);

    if (pageViewNames.has(event.eventName)) {
      summary.pageViews24h += 1;
    }

    if (event.eventName === "battle_view") {
      battleSessions24h.add(event.sessionId);
    }

    if (event.walletAddress) {
      wallets24h.add(event.walletAddress);
    }

    if (event.txHash && submittedNames.has(event.eventName)) {
      submittedTx24h.add(event.txHash);
    }

    if (event.txHash && confirmedNames.has(event.eventName)) {
      const confirmedEventName = event.eventName as "bet_confirmed" | "claim_confirmed";
      confirmedTx24h.add(event.txHash);
      const recentKey = `${confirmedEventName}:${event.txHash}`;
      if (!recentTransactions.has(recentKey)) {
        recentTransactions.set(recentKey, {
          eventName: confirmedEventName,
          txHash: event.txHash,
          walletAddress: event.walletAddress,
          lobbyId: event.lobbyId,
          createdAt: event.createdAt,
        });
      }
    }
  }

  summary.uniqueSessions24h = sessions24h.size;
  summary.battleSessions24h = battleSessions24h.size;
  summary.uniqueWallets24h = wallets24h.size;
  summary.submittedTransactions24h = submittedTx24h.size;
  summary.confirmedTransactions24h = confirmedTx24h.size;
  summary.repeatSessions7d = [...sessionDays7d.values()].filter((days) => days.size >= 2).length;
  summary.recentTransactions = [...recentTransactions.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);

  return summary;
}

export async function getTractionSummary(liveListeners = 0): Promise<TractionSummary> {
  const backend = getBackend();

  if (backend === "postgres") {
    const sql = getPostgresClient();
    if (!sql) {
      return emptySummary("file", liveListeners);
    }

    await ensureSchema(sql);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await sql<AnalyticsEventRow[]>`
      SELECT
        event_key,
        event_name,
        session_id,
        path,
        wallet_address,
        tx_hash,
        lobby_id,
        metadata,
        created_at
      FROM analytics_events
      WHERE created_at >= ${since}
      ORDER BY created_at DESC
      LIMIT 10000
    `;

    return summarizeEvents(rows.map(toStoredEvent), backend, liveListeners);
  }

  const state = await readFileState();
  return summarizeEvents(pruneEvents(state.events, Date.now()), backend, liveListeners);
}
