import "server-only";

import postgres from "postgres";

import {
  defaultAgentRuntimeProfile,
  defaultAgentRuntimeProfiles,
  type AgentProfileSource,
  type AgentRuntimeProfile,
  type ArenaAgentId,
} from "@/lib/agentProfiles";

interface AgentProfileRow {
  agent_id: number;
  mutation_version: number;
  bpm_range: number;
  layer_density: number;
  glitch_intensity: number;
  bass_weight: number;
  wins: number;
  losses: number;
  source: AgentProfileSource;
  updated_at: Date | string;
}

type ProfileMap = Record<ArenaAgentId, AgentRuntimeProfile>;
type SqlTag = (template: TemplateStringsArray, ...parameters: unknown[]) => Promise<unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_POSTGRES_CLIENT__: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_AGENT_PROFILE_SCHEMA_PROMISE__: Promise<void> | undefined;
}

const AGENT_IDS: ArenaAgentId[] = [0, 1, 2, 3];

function getDatabaseUrl(): string | null {
  const value = process.env.DATABASE_URL?.trim();
  return value ? value : null;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toProfile(row: AgentProfileRow): AgentRuntimeProfile {
  return {
    mutationVersion: row.mutation_version,
    bpmRange: row.bpm_range,
    layerDensity: row.layer_density,
    glitchIntensity: row.glitch_intensity,
    bassWeight: row.bass_weight,
    wins: row.wins,
    losses: row.losses,
    source: row.source,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : typeof row.updated_at === "string"
          ? row.updated_at
          : null,
  };
}

function parseBootstrapProfiles(): ProfileMap {
  const defaults = defaultAgentRuntimeProfiles();
  const raw = process.env.AGENT_PROFILE_SEED_JSON?.trim();
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<AgentRuntimeProfile> | undefined>;

    for (const agentId of AGENT_IDS) {
      const seeded = parsed[String(agentId)];
      if (!seeded || typeof seeded !== "object") {
        continue;
      }

      defaults[agentId] = {
        mutationVersion: clamp(Math.floor(seeded.mutationVersion ?? defaults[agentId].mutationVersion), 0, 255),
        bpmRange: clamp(Math.floor(seeded.bpmRange ?? defaults[agentId].bpmRange), 110, 180),
        layerDensity: clamp(Math.floor(seeded.layerDensity ?? defaults[agentId].layerDensity), 1, 10),
        glitchIntensity: clamp(Math.floor(seeded.glitchIntensity ?? defaults[agentId].glitchIntensity), 1, 10),
        bassWeight: clamp(Math.floor(seeded.bassWeight ?? defaults[agentId].bassWeight), 1, 10),
        wins: Math.max(0, Math.floor(seeded.wins ?? defaults[agentId].wins)),
        losses: Math.max(0, Math.floor(seeded.losses ?? defaults[agentId].losses)),
        source: "seed",
        updatedAt: null,
      };
    }
  } catch {
    return defaults;
  }

  return defaults;
}

async function ensureProfileSchema(sql: ReturnType<typeof postgres>): Promise<void> {
  if (!global.__PHONK_ARENA_AGENT_PROFILE_SCHEMA_PROMISE__) {
    global.__PHONK_ARENA_AGENT_PROFILE_SCHEMA_PROMISE__ = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS agent_profiles (
          agent_id SMALLINT PRIMARY KEY,
          mutation_version INTEGER NOT NULL,
          bpm_range INTEGER NOT NULL,
          layer_density INTEGER NOT NULL,
          glitch_intensity INTEGER NOT NULL,
          bass_weight INTEGER NOT NULL,
          wins INTEGER NOT NULL,
          losses INTEGER NOT NULL,
          source TEXT NOT NULL DEFAULT 'postgres',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS agent_epoch_progressions (
          epoch_id BIGINT PRIMARY KEY,
          winner_agent_id SMALLINT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS agent_mutation_history (
          id BIGSERIAL PRIMARY KEY,
          epoch_id BIGINT NOT NULL,
          agent_id SMALLINT NOT NULL,
          winner_agent_id SMALLINT NOT NULL,
          did_win BOOLEAN NOT NULL,
          old_mutation_version INTEGER NOT NULL,
          new_mutation_version INTEGER NOT NULL,
          old_bpm_range INTEGER NOT NULL,
          new_bpm_range INTEGER NOT NULL,
          old_layer_density INTEGER NOT NULL,
          new_layer_density INTEGER NOT NULL,
          old_glitch_intensity INTEGER NOT NULL,
          new_glitch_intensity INTEGER NOT NULL,
          old_bass_weight INTEGER NOT NULL,
          new_bass_weight INTEGER NOT NULL,
          old_wins INTEGER NOT NULL,
          new_wins INTEGER NOT NULL,
          old_losses INTEGER NOT NULL,
          new_losses INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (epoch_id, agent_id)
        )
      `;
    })();
  }

  await global.__PHONK_ARENA_AGENT_PROFILE_SCHEMA_PROMISE__;
}

async function bootstrapProfilesIfNeeded(sql: ReturnType<typeof postgres>): Promise<void> {
  const [{ count }] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM agent_profiles
  `;

  if (Number(count) > 0) {
    return;
  }

  const bootstrap = parseBootstrapProfiles();

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof postgres>;
    for (const agentId of AGENT_IDS) {
      const profile = bootstrap[agentId];
      await tx`
        INSERT INTO agent_profiles (
          agent_id,
          mutation_version,
          bpm_range,
          layer_density,
          glitch_intensity,
          bass_weight,
          wins,
          losses,
          source
        ) VALUES (
          ${agentId},
          ${profile.mutationVersion},
          ${profile.bpmRange},
          ${profile.layerDensity},
          ${profile.glitchIntensity},
          ${profile.bassWeight},
          ${profile.wins},
          ${profile.losses},
          ${profile.source}
        )
        ON CONFLICT (agent_id) DO NOTHING
      `;
    }
  });
}

function mutateWinner(agentId: ArenaAgentId, profile: AgentRuntimeProfile, epochNumber: number): AgentRuntimeProfile {
  const variance = epochNumber % 3;

  if (agentId === 0) {
    return {
      ...profile,
      mutationVersion: profile.mutationVersion + 1,
      bpmRange: clamp(profile.bpmRange + 3 + variance, 110, 180),
      layerDensity: clamp(profile.layerDensity + (variance === 2 ? 1 : 0), 1, 10),
      glitchIntensity: clamp(profile.glitchIntensity + 1, 1, 10),
      bassWeight: clamp(profile.bassWeight + 1, 1, 10),
      wins: profile.wins + 1,
      source: "postgres",
    };
  }

  if (agentId === 1) {
    return {
      ...profile,
      mutationVersion: profile.mutationVersion + 1,
      bpmRange: clamp(profile.bpmRange - (variance === 0 ? 1 : 2), 110, 180),
      layerDensity: clamp(profile.layerDensity + 1, 1, 10),
      glitchIntensity: clamp(profile.glitchIntensity + (variance === 1 ? 1 : 0), 1, 10),
      bassWeight: clamp(profile.bassWeight + (variance === 2 ? 1 : 0), 1, 10),
      wins: profile.wins + 1,
      source: "postgres",
    };
  }

  if (agentId === 2) {
    const targetBpm = 142 + variance;
    const nextBpm =
      profile.bpmRange === targetBpm ? profile.bpmRange : profile.bpmRange < targetBpm ? profile.bpmRange + 2 : profile.bpmRange - 2;

    return {
      ...profile,
      mutationVersion: profile.mutationVersion + 1,
      bpmRange: clamp(nextBpm, 110, 180),
      layerDensity: clamp(profile.layerDensity + (profile.layerDensity < 6 ? 1 : 0), 1, 10),
      glitchIntensity: clamp(profile.glitchIntensity + (profile.glitchIntensity < 5 ? 1 : 0), 1, 10),
      bassWeight: clamp(profile.bassWeight + (profile.bassWeight < 6 ? 1 : 0), 1, 10),
      wins: profile.wins + 1,
      source: "postgres",
    };
  }

  return {
    ...profile,
    mutationVersion: profile.mutationVersion + 1,
    bpmRange: clamp(profile.bpmRange + 1 + variance, 110, 180),
    layerDensity: clamp(profile.layerDensity + 1, 1, 10),
    glitchIntensity: clamp(profile.glitchIntensity + 2, 1, 10),
    bassWeight: clamp(profile.bassWeight + (variance === 0 ? 0 : 1), 1, 10),
    wins: profile.wins + 1,
    source: "postgres",
  };
}

function mutateLoser(agentId: ArenaAgentId, profile: AgentRuntimeProfile, epochNumber: number): AgentRuntimeProfile {
  const variance = epochNumber % 2;

  if (agentId === 0) {
    return {
      ...profile,
      bpmRange: clamp(profile.bpmRange + 1, 110, 180),
      layerDensity: clamp(profile.layerDensity + variance, 1, 10),
      glitchIntensity: clamp(profile.glitchIntensity + 1, 1, 10),
      bassWeight: clamp(profile.bassWeight + 1, 1, 10),
      losses: profile.losses + 1,
      source: "postgres",
    };
  }

  if (agentId === 1) {
    return {
      ...profile,
      bpmRange: clamp(profile.bpmRange - 1, 110, 180),
      layerDensity: clamp(profile.layerDensity + 1, 1, 10),
      glitchIntensity: clamp(profile.glitchIntensity + variance, 1, 10),
      bassWeight: clamp(profile.bassWeight + 1, 1, 10),
      losses: profile.losses + 1,
      source: "postgres",
    };
  }

  if (agentId === 2) {
    const targetBpm = 140;
    const nextBpm =
      profile.bpmRange === targetBpm ? profile.bpmRange : profile.bpmRange < targetBpm ? profile.bpmRange + 1 : profile.bpmRange - 1;

    return {
      ...profile,
      bpmRange: clamp(nextBpm, 110, 180),
      layerDensity: clamp(profile.layerDensity + (profile.layerDensity > 6 ? -1 : 1), 1, 10),
      glitchIntensity: clamp(profile.glitchIntensity + (profile.glitchIntensity > 5 ? -1 : 1), 1, 10),
      bassWeight: clamp(profile.bassWeight + (profile.bassWeight > 6 ? -1 : 1), 1, 10),
      losses: profile.losses + 1,
      source: "postgres",
    };
  }

  return {
    ...profile,
    bpmRange: clamp(profile.bpmRange + variance, 110, 180),
    layerDensity: clamp(profile.layerDensity + 1, 1, 10),
    glitchIntensity: clamp(profile.glitchIntensity + 1, 1, 10),
    bassWeight: clamp(profile.bassWeight + (variance === 0 ? -1 : 0), 1, 10),
    losses: profile.losses + 1,
    source: "postgres",
  };
}

export async function getAgentRuntimeProfiles(): Promise<ProfileMap> {
  const defaults = defaultAgentRuntimeProfiles();
  const sql = getPostgresClient();
  if (!sql) {
    return defaults;
  }

  await ensureProfileSchema(sql);
  await bootstrapProfilesIfNeeded(sql);

  const rows = await sql<AgentProfileRow[]>`
    SELECT
      agent_id,
      mutation_version,
      bpm_range,
      layer_density,
      glitch_intensity,
      bass_weight,
      wins,
      losses,
      source,
      updated_at
    FROM agent_profiles
    ORDER BY agent_id ASC
  `;

  for (const row of rows) {
    if (row.agent_id in defaults) {
      defaults[row.agent_id as ArenaAgentId] = toProfile(row);
    }
  }

  return defaults;
}

export async function getAgentRuntimeProfile(agentId: ArenaAgentId): Promise<AgentRuntimeProfile> {
  const profiles = await getAgentRuntimeProfiles();
  return profiles[agentId] ?? defaultAgentRuntimeProfile(agentId);
}

export async function applyArenaEpochProgressionIfNeeded(
  epochId: bigint | number,
  winnerAgentId: number,
): Promise<{ action: "applied" | "skipped"; reason?: "already_applied" | "db_unavailable" | "tie_epoch"; profiles: ProfileMap }> {
  const sql = getPostgresClient();
  if (!sql) {
    return {
      action: "skipped",
      reason: "db_unavailable",
      profiles: defaultAgentRuntimeProfiles(),
    };
  }

  await ensureProfileSchema(sql);
  await bootstrapProfilesIfNeeded(sql);

  if (winnerAgentId === 4) {
    return {
      action: "skipped",
      reason: "tie_epoch",
      profiles: await getAgentRuntimeProfiles(),
    };
  }

  const winner = AGENT_IDS.find((agentId) => agentId === winnerAgentId);
  if (typeof winner === "undefined") {
    return {
      action: "skipped",
      reason: "db_unavailable",
      profiles: await getAgentRuntimeProfiles(),
    };
  }

  const result = await sql.begin(async (transaction) => {
    const tx = transaction as unknown as SqlTag;
    const inserted = (await tx`
      INSERT INTO agent_epoch_progressions (
        epoch_id,
        winner_agent_id
      ) VALUES (
        ${BigInt(epochId)},
        ${winnerAgentId}
      )
      ON CONFLICT (epoch_id) DO NOTHING
      RETURNING epoch_id::text AS epoch_id
    `) as unknown as Array<{ epoch_id: string }>;

    if (inserted.length === 0) {
      const existingRows = (await tx`
        SELECT
          agent_id,
          mutation_version,
          bpm_range,
          layer_density,
          glitch_intensity,
          bass_weight,
          wins,
          losses,
          source,
          updated_at
        FROM agent_profiles
        ORDER BY agent_id ASC
      `) as unknown as AgentProfileRow[];

      const existing = defaultAgentRuntimeProfiles();
      for (const row of existingRows) {
        existing[row.agent_id as ArenaAgentId] = toProfile(row);
      }

      return {
        action: "skipped" as const,
        reason: "already_applied" as const,
        profiles: existing,
      };
    }

    const currentRows = (await tx`
      SELECT
        agent_id,
        mutation_version,
        bpm_range,
        layer_density,
        glitch_intensity,
        bass_weight,
        wins,
        losses,
        source,
        updated_at
      FROM agent_profiles
      ORDER BY agent_id ASC
      FOR UPDATE
    `) as unknown as AgentProfileRow[];

    const currentProfiles = defaultAgentRuntimeProfiles();
    for (const row of currentRows) {
      currentProfiles[row.agent_id as ArenaAgentId] = toProfile(row);
    }

    const epochNumber = Number(epochId);
    const nextProfiles = defaultAgentRuntimeProfiles();

    for (const agentId of AGENT_IDS) {
      const current = currentProfiles[agentId];
      const next = agentId === winner ? mutateWinner(agentId, current, epochNumber) : mutateLoser(agentId, current, epochNumber);
      next.updatedAt = new Date().toISOString();
      nextProfiles[agentId] = next;

      await tx`
        UPDATE agent_profiles
        SET
          mutation_version = ${next.mutationVersion},
          bpm_range = ${next.bpmRange},
          layer_density = ${next.layerDensity},
          glitch_intensity = ${next.glitchIntensity},
          bass_weight = ${next.bassWeight},
          wins = ${next.wins},
          losses = ${next.losses},
          source = ${next.source},
          updated_at = NOW()
        WHERE agent_id = ${agentId}
      `;

      await tx`
        INSERT INTO agent_mutation_history (
          epoch_id,
          agent_id,
          winner_agent_id,
          did_win,
          old_mutation_version,
          new_mutation_version,
          old_bpm_range,
          new_bpm_range,
          old_layer_density,
          new_layer_density,
          old_glitch_intensity,
          new_glitch_intensity,
          old_bass_weight,
          new_bass_weight,
          old_wins,
          new_wins,
          old_losses,
          new_losses
        ) VALUES (
          ${BigInt(epochId)},
          ${agentId},
          ${winnerAgentId},
          ${agentId === winner},
          ${current.mutationVersion},
          ${next.mutationVersion},
          ${current.bpmRange},
          ${next.bpmRange},
          ${current.layerDensity},
          ${next.layerDensity},
          ${current.glitchIntensity},
          ${next.glitchIntensity},
          ${current.bassWeight},
          ${next.bassWeight},
          ${current.wins},
          ${next.wins},
          ${current.losses},
          ${next.losses}
        )
        ON CONFLICT (epoch_id, agent_id) DO NOTHING
      `;
    }

    return {
      action: "applied" as const,
      profiles: nextProfiles,
    };
  });

  return result;
}
