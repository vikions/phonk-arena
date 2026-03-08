import "server-only";

import { getAgentDNA, getCurrentEpochId } from "@/lib/contract";
import type {
  ArenaAgentDnaSnapshot,
  ArenaAgentId,
  ArenaAgentName,
  ArenaBattleAgentSnapshot,
  ArenaBattleSnapshot,
  ArenaClipHistoryItem,
  ArenaNowPlayingClip,
  ArenaScoreBreakdown,
} from "@/lib/arenaTypes";
import { DEFAULT_DNA } from "@/lib/musicEngine";
import { getDailyAgentTokenPicks, getLiveDailyAgentTokenPicks } from "@/lib/server/tokenDiscovery";
import type { DiscoveredInkToken } from "@/lib/tokenDiscovery";
import type { AgentId, AgentStrategy, AgentStyle, LobbyId } from "@/lib/types";

const CLIP_DURATION_MS = 10_000;
const CLIP_GAP_MS = 2_500;
const CLIP_SLOT_MS = CLIP_DURATION_MS + CLIP_GAP_MS;
const LISTENER_TTL_MS = 30_000;
const HISTORY_LIMIT = 12;
const FEED_CACHE_TTL_MS = 20_000;
const ARENA_ID = "ink-phonk-arena";
const EPOCH_MS = 3_600_000;
const AGENT_ORDER: ArenaAgentId[] = [0, 1, 2, 3];

interface ArenaAgentMeta {
  agentId: ArenaAgentId;
  name: ArenaAgentName;
  role: string;
  image: string;
  accent: string;
  aura: string;
  strategyLabel: string;
  renderLobbyId: LobbyId;
  renderAgentId: AgentId;
  renderStrategy: AgentStrategy;
  baseStyle: AgentStyle;
}

interface LoopState {
  running: boolean;
  startedAt: number | null;
  runStartedAt: number | null;
  runStartElapsedMs: number;
  elapsedMs: number;
  processedClipCount: number;
}

interface RuntimeAgentMemory {
  clipsPlayed: number;
  mutationDrift: number;
}

interface CachedArenaAgentFeed {
  agentId: ArenaAgentId;
  name: ArenaAgentName;
  role: string;
  image: string;
  accent: string;
  aura: string;
  strategyLabel: string;
  renderLobbyId: LobbyId;
  renderAgentId: AgentId;
  renderStrategy: AgentStrategy;
  baseStyle: AgentStyle;
  token: DiscoveredInkToken;
  selectedToken: DiscoveredInkToken;
  dna: ArenaAgentDnaSnapshot;
  score: ArenaScoreBreakdown;
}

interface ArenaDataCache {
  fetchedAt: number;
  agents: CachedArenaAgentFeed[];
}

interface ArenaRuntimeState {
  listeners: Record<string, number>;
  loop: LoopState;
  clipHistory: ArenaClipHistoryItem[];
  agentMemory: Record<ArenaAgentId, RuntimeAgentMemory>;
  dataCache: ArenaDataCache | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_RUNTIME__: ArenaRuntimeState | undefined;
}

const AGENT_META: ArenaAgentMeta[] = [
  {
    agentId: 0,
    name: "RAGE",
    role: "Volatility Hunter",
    image: "/person/RAGE.png",
    accent: "#f43f5e",
    aura: "rgba(244,63,94,0.32)",
    strategyLabel: "Breaks The Ceiling",
    renderLobbyId: "drift-hard",
    renderAgentId: "A",
    renderStrategy: "AGGRESSIVE",
    baseStyle: "HARD",
  },
  {
    agentId: 1,
    name: "GHOST",
    role: "Holder Whisperer",
    image: "/person/GHOST.png",
    accent: "#38bdf8",
    aura: "rgba(56,189,248,0.28)",
    strategyLabel: "Drifts Through Holders",
    renderLobbyId: "soft-night",
    renderAgentId: "B",
    renderStrategy: "ADAPTIVE",
    baseStyle: "SOFT",
  },
  {
    agentId: 2,
    name: "ORACLE",
    role: "Flow Reader",
    image: "/person/ORACLE.png",
    accent: "#facc15",
    aura: "rgba(250,204,21,0.25)",
    strategyLabel: "Reads Market Weight",
    renderLobbyId: "drift-hard",
    renderAgentId: "B",
    renderStrategy: "SAFE",
    baseStyle: "SOFT",
  },
  {
    agentId: 3,
    name: "GLITCH",
    role: "Chaos Seeder",
    image: "/person/GLITCH.png",
    accent: "#22c55e",
    aura: "rgba(34,197,94,0.28)",
    strategyLabel: "Corrupts The Floor",
    renderLobbyId: "chaos-lab",
    renderAgentId: "A",
    renderStrategy: "ADAPTIVE",
    baseStyle: "HARD",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function makeSessionId(): string {
  return `arena_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function defaultLoopState(): LoopState {
  return {
    running: false,
    startedAt: null,
    runStartedAt: null,
    runStartElapsedMs: 0,
    elapsedMs: 0,
    processedClipCount: 0,
  };
}

function defaultRuntimeState(): ArenaRuntimeState {
  return {
    listeners: {},
    loop: defaultLoopState(),
    clipHistory: [],
    agentMemory: {
      0: { clipsPlayed: 0, mutationDrift: 0.16 },
      1: { clipsPlayed: 0, mutationDrift: 0.1 },
      2: { clipsPlayed: 0, mutationDrift: 0.08 },
      3: { clipsPlayed: 0, mutationDrift: 0.18 },
    },
    dataCache: null,
  };
}

function getArenaState(): ArenaRuntimeState {
  if (!global.__PHONK_ARENA_RUNTIME__) {
    global.__PHONK_ARENA_RUNTIME__ = defaultRuntimeState();
  }

  return global.__PHONK_ARENA_RUNTIME__;
}

function normalizeSpan(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return 0.5;
  }

  return clamp((value - min) / (max - min), 0, 1);
}

function normalizeRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) {
    return 0;
  }

  return clamp(value / max, 0, 1);
}

function getPriceLead(tokens: DiscoveredInkToken[], value: number): number {
  const prices = tokens.map((token) => token.priceChange24h);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return normalizeSpan(value, min, max);
}

function resolveAgentStyle(
  agent: ArenaAgentMeta,
  token: DiscoveredInkToken,
  dna: ArenaAgentDnaSnapshot,
  mutationDrift: number,
): AgentStyle {
  const priceNorm = clamp(Math.abs(token.priceChange24h) / 12, 0, 1);
  const activityNorm = clamp(Math.log10(token.volume24h + 1) / 3, 0, 1);
  const mutationNorm = clamp((dna.mutationVersion * 0.12 + dna.glitchIntensity * 0.06 + mutationDrift), 0, 1);

  if (agent.name === "RAGE") {
    return "HARD";
  }

  if (agent.name === "GHOST") {
    return "SOFT";
  }

  if (agent.name === "ORACLE") {
    return token.liquidityUsd > 45_000 || token.txCount24h > 220 ? "HARD" : "SOFT";
  }

  return priceNorm + activityNorm + mutationNorm > 1.15 ? "HARD" : agent.baseStyle;
}

function buildScoreBreakdown(tokens: DiscoveredInkToken[], token: DiscoveredInkToken): ArenaScoreBreakdown {
  const maxVolume = Math.max(...tokens.map((item) => item.volume24h), 0);
  const maxTxCount = Math.max(...tokens.map((item) => item.txCount24h), 0);
  const maxLiquidity = Math.max(...tokens.map((item) => item.liquidityUsd), 0);
  const maxHolderDelta = Math.max(
    ...tokens.map((item) => (item.holderDelta24h !== null ? item.holderDelta24h : 0)),
    0,
  );

  const priceLead = getPriceLead(tokens, token.priceChange24h);
  const volumeStrength = normalizeRatio(token.volume24h, maxVolume);
  const flowStrength = normalizeRatio(token.txCount24h, maxTxCount);
  const liquiditySupport = normalizeRatio(token.liquidityUsd, maxLiquidity);
  const holderFlow =
    token.holderDelta24h !== null ? normalizeRatio(token.holderDelta24h, maxHolderDelta) : 0;
  const total =
    priceLead * 0.55 +
    volumeStrength * 0.25 +
    flowStrength * 0.1 +
    liquiditySupport * 0.05 +
    holderFlow * 0.05;

  return {
    priceLead: round2(priceLead * 100),
    volumeStrength: round2(volumeStrength * 100),
    flowStrength: round2(flowStrength * 100),
    liquiditySupport: round2(liquiditySupport * 100),
    holderFlow: round2(holderFlow * 100),
    total: round2(total * 100),
  };
}

async function getArenaFeed(now: number, state: ArenaRuntimeState): Promise<CachedArenaAgentFeed[]> {
  if (state.dataCache && now - state.dataCache.fetchedAt < FEED_CACHE_TTL_MS) {
    return state.dataCache.agents;
  }

  const [selectedPicks, livePicks] = await Promise.all([
    getDailyAgentTokenPicks(now),
    getLiveDailyAgentTokenPicks(now).catch(() => null),
  ]);

  const liveTokens = AGENT_META.map((agent) => livePicks?.[agent.agentId]?.token ?? selectedPicks[agent.agentId].token);
  const dnaEntries = await Promise.all(
    AGENT_META.map(async (agent) => {
      const contractDna = await getAgentDNA(agent.agentId);
      return {
        agentId: agent.agentId,
        dna: {
          mutationVersion: contractDna?.mutationVersion ?? DEFAULT_DNA[agent.agentId].mutationVersion,
          bpmRange: contractDna?.bpmRange ?? DEFAULT_DNA[agent.agentId].bpmRange,
          layerDensity: contractDna?.layerDensity ?? DEFAULT_DNA[agent.agentId].layerDensity,
          glitchIntensity: contractDna?.glitchIntensity ?? DEFAULT_DNA[agent.agentId].glitchIntensity,
          bassWeight: contractDna?.bassWeight ?? DEFAULT_DNA[agent.agentId].bassWeight,
          wins: contractDna?.wins ?? 0,
          losses: contractDna?.losses ?? 0,
        } satisfies ArenaAgentDnaSnapshot,
      };
    }),
  );

  const dnaByAgent = new Map(dnaEntries.map((entry) => [entry.agentId, entry.dna]));
  const agents = AGENT_META.map((agent) => {
    const selectedToken = selectedPicks[agent.agentId].token;
    const token = livePicks?.[agent.agentId]?.token ?? selectedToken;

    return {
      ...agent,
      token,
      selectedToken,
      dna: dnaByAgent.get(agent.agentId) ?? {
        mutationVersion: DEFAULT_DNA[agent.agentId].mutationVersion,
        bpmRange: DEFAULT_DNA[agent.agentId].bpmRange,
        layerDensity: DEFAULT_DNA[agent.agentId].layerDensity,
        glitchIntensity: DEFAULT_DNA[agent.agentId].glitchIntensity,
        bassWeight: DEFAULT_DNA[agent.agentId].bassWeight,
        wins: 0,
        losses: 0,
      },
      score: buildScoreBreakdown(liveTokens, token),
    };
  });

  state.dataCache = {
    fetchedAt: now,
    agents,
  };

  return agents;
}

function buildArenaAgents(state: ArenaRuntimeState, feed: CachedArenaAgentFeed[]): ArenaBattleAgentSnapshot[] {
  return feed.map((agent) => ({
    ...agent,
    clipsPlayed: state.agentMemory[agent.agentId].clipsPlayed,
    mutationDrift: round2(state.agentMemory[agent.agentId].mutationDrift),
  }));
}

function getLeaderboard(agents: ArenaBattleAgentSnapshot[]): ArenaAgentId[] {
  return [...agents]
    .sort((left, right) => {
      const scoreDelta = right.score.total - left.score.total;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return right.token.priceChange24h - left.token.priceChange24h;
    })
    .map((agent) => agent.agentId);
}

function activeAgentForClip(clipIndex: number): ArenaAgentId {
  return AGENT_ORDER[clipIndex % AGENT_ORDER.length];
}

function getActiveElapsedMs(state: ArenaRuntimeState, now: number): number {
  if (!state.loop.running || state.loop.runStartedAt === null) {
    return state.loop.elapsedMs;
  }

  return state.loop.runStartElapsedMs + (now - state.loop.runStartedAt);
}

function pruneStaleListeners(state: ArenaRuntimeState, now: number): boolean {
  let changed = false;

  Object.entries(state.listeners).forEach(([sessionId, touchedAt]) => {
    if (now - touchedAt > LISTENER_TTL_MS) {
      delete state.listeners[sessionId];
      changed = true;
    }
  });

  return changed;
}

function resumeLoop(state: ArenaRuntimeState, now: number): boolean {
  if (state.loop.running) {
    return false;
  }

  state.loop.running = true;
  state.loop.runStartedAt = now;
  state.loop.runStartElapsedMs = state.loop.elapsedMs;
  if (state.loop.startedAt === null) {
    state.loop.startedAt = now;
  }

  return true;
}

function pauseLoop(state: ArenaRuntimeState, now: number): boolean {
  if (!state.loop.running || state.loop.runStartedAt === null) {
    return false;
  }

  const activeElapsed = state.loop.runStartElapsedMs + (now - state.loop.runStartedAt);
  const snappedElapsed = Math.floor(activeElapsed / CLIP_SLOT_MS) * CLIP_SLOT_MS;

  state.loop.elapsedMs = snappedElapsed;
  state.loop.running = false;
  state.loop.runStartedAt = null;
  state.loop.runStartElapsedMs = snappedElapsed;
  return true;
}

function applyListenerDrivenLoop(state: ArenaRuntimeState, now: number): boolean {
  const listeners = Object.keys(state.listeners).length;
  return listeners > 0 ? resumeLoop(state, now) : pauseLoop(state, now);
}

function computeClipPlan(agent: ArenaBattleAgentSnapshot, clipIndex: number): Omit<ArenaNowPlayingClip, "clipId" | "startedAt" | "endsAt" | "durationMs" | "clipIndex"> {
  const phase = ((clipIndex % 16) / 16) * Math.PI * 2;
  const phaseSwing = (Math.sin(phase) + 1) / 2;
  const mutationNorm = clamp(
    agent.mutationDrift + agent.dna.mutationVersion * 0.08 + agent.dna.glitchIntensity / 12,
    0,
    1,
  );
  const priceNorm = clamp(Math.abs(agent.token.priceChange24h) / 14, 0, 1);
  const volumeNorm = clamp(Math.log10(agent.token.volume24h + 1) / 3, 0, 1);
  const liquidityNorm = clamp(Math.log10(agent.token.liquidityUsd + 1) / 5, 0, 1);
  const txNorm = clamp(agent.token.txCount24h / 320, 0, 1);
  const densityNorm = clamp(agent.dna.layerDensity / 10, 0, 1);
  const bassNorm = clamp(agent.dna.bassWeight / 10, 0, 1);
  const glitchNorm = clamp(agent.dna.glitchIntensity / 10, 0, 1);
  const scoreNorm = clamp(agent.score.total / 100, 0, 1);
  const style = resolveAgentStyle(
    AGENT_META.find((entry) => entry.agentId === agent.agentId)!,
    agent.token,
    agent.dna,
    agent.mutationDrift,
  );

  let intensity = 0.48 + priceNorm * 0.18 + volumeNorm * 0.08 + scoreNorm * 0.1;
  let patternDensity = 0.38 + densityNorm * 0.24 + txNorm * 0.16 + phaseSwing * 0.08;
  let distortion = 0.12 + glitchNorm * 0.2 + mutationNorm * 0.18 + priceNorm * 0.1;
  let fxChance = 0.12 + mutationNorm * 0.14 + (1 - liquidityNorm) * 0.08 + phaseSwing * 0.06;
  let bpm = agent.dna.bpmRange + priceNorm * 12 + txNorm * 6 + scoreNorm * 4;

  if (agent.name === "RAGE") {
    intensity += 0.16 + bassNorm * 0.08;
    patternDensity += 0.08;
    distortion += 0.14;
    bpm += 10;
  } else if (agent.name === "GHOST") {
    intensity -= 0.08;
    patternDensity -= 0.03;
    distortion -= 0.06;
    fxChance += 0.12;
    bpm -= 8;
  } else if (agent.name === "ORACLE") {
    intensity += liquidityNorm * 0.06;
    patternDensity += liquidityNorm * 0.04;
    distortion -= 0.05;
    fxChance -= 0.04;
    bpm += liquidityNorm * 5;
  } else {
    intensity += mutationNorm * 0.08;
    patternDensity += 0.06;
    distortion += mutationNorm * 0.16;
    fxChance += 0.14;
    bpm += 5;
  }

  return {
    agentId: agent.agentId,
    agentPersona: agent.name,
    seed: `arena:${ARENA_ID}:${clipIndex}:${agent.name}:${agent.token.address}:${Math.round(agent.mutationDrift * 100)}`,
    style,
    strategy: agent.renderStrategy,
    renderLobbyId: agent.renderLobbyId,
    renderAgentId: agent.renderAgentId,
    intensity: round2(clamp(intensity, 0.28, 0.98)),
    bpm: round1(clamp(bpm, 118, 182)),
    patternDensity: round2(clamp(patternDensity, 0.2, 0.98)),
    distortion: round2(clamp(distortion, 0.05, 0.95)),
    mutationLevel: round2(clamp(mutationNorm + priceNorm * 0.12, 0.08, 0.98)),
    fxChance: round2(clamp(fxChance, 0.04, 0.9)),
  };
}

function buildClipNote(agent: ArenaBattleAgentSnapshot, leaderId: ArenaAgentId): string {
  if (agent.agentId === leaderId) {
    return `${agent.name} is pressing the crown with ${agent.token.symbol} on top of the board.`;
  }

  if (agent.score.priceLead > 70) {
    return `${agent.name} is surging on price, but still needs more market weight to take the floor.`;
  }

  if (agent.score.volumeStrength > 70) {
    return `${agent.name} has flow behind the pick, but the crown is still out of reach.`;
  }

  return `${agent.name} is mutating around ${agent.token.symbol} and looking for a harder next pass.`;
}

function processCompletedClip(state: ArenaRuntimeState, clipIndex: number, agents: ArenaBattleAgentSnapshot[]): void {
  if (state.loop.runStartedAt === null) {
    return;
  }

  const agentId = activeAgentForClip(clipIndex);
  const agent = agents.find((entry) => entry.agentId === agentId);
  if (!agent) {
    return;
  }

  const leaderboard = getLeaderboard(agents);
  const leaderId = leaderboard[0];
  const plan = computeClipPlan(agent, clipIndex);
  const clipStartElapsed = clipIndex * CLIP_SLOT_MS;
  const startedAt = state.loop.runStartedAt + (clipStartElapsed - state.loop.runStartElapsedMs);

  AGENT_ORDER.forEach((id) => {
    if (id === agentId) {
      return;
    }

    state.agentMemory[id].mutationDrift = clamp(state.agentMemory[id].mutationDrift - 0.01, 0.06, 0.8);
  });

  state.agentMemory[agentId].clipsPlayed += 1;
  state.agentMemory[agentId].mutationDrift = clamp(
    state.agentMemory[agentId].mutationDrift + (agentId === leaderId ? 0.016 : 0.028),
    0.06,
    0.8,
  );

  state.clipHistory.unshift({
    clipId: `${ARENA_ID}-${clipIndex}`,
    clipIndex,
    agentId,
    agentPersona: agent.name,
    tokenSymbol: agent.token.symbol,
    startedAt,
    endedAt: startedAt + CLIP_DURATION_MS,
    style: plan.style,
    strategy: plan.strategy,
    intensity: plan.intensity,
    bpm: plan.bpm,
    patternDensity: plan.patternDensity,
    distortion: plan.distortion,
    mutationLevel: plan.mutationLevel,
    fxChance: plan.fxChance,
    liveScore: agent.score.total,
    note: buildClipNote(agent, leaderId),
  });
  state.clipHistory = state.clipHistory.slice(0, HISTORY_LIMIT);
  state.loop.processedClipCount += 1;
}

function syncClipSimulation(state: ArenaRuntimeState, now: number, agents: ArenaBattleAgentSnapshot[]): boolean {
  if (!state.loop.running) {
    return false;
  }

  const elapsed = getActiveElapsedMs(state, now);
  const completedClipCount = Math.floor((elapsed + CLIP_GAP_MS) / CLIP_SLOT_MS);

  let changed = false;
  while (state.loop.processedClipCount < completedClipCount) {
    processCompletedClip(state, state.loop.processedClipCount, agents);
    changed = true;
  }

  return changed;
}

function buildNowPlaying(state: ArenaRuntimeState, now: number, agents: ArenaBattleAgentSnapshot[]): ArenaNowPlayingClip | null {
  if (!state.loop.running) {
    return null;
  }

  const elapsed = getActiveElapsedMs(state, now);
  const clipIndex = Math.floor(elapsed / CLIP_SLOT_MS);
  const clipOffsetInSlot = elapsed % CLIP_SLOT_MS;
  if (clipOffsetInSlot >= CLIP_DURATION_MS) {
    return null;
  }

  const agentId = activeAgentForClip(clipIndex);
  const agent = agents.find((entry) => entry.agentId === agentId);
  if (!agent) {
    return null;
  }

  const plan = computeClipPlan(agent, clipIndex);
  const startedAt = now - clipOffsetInSlot;

  return {
    clipId: `${ARENA_ID}-${clipIndex}`,
    clipIndex,
    startedAt,
    endsAt: startedAt + CLIP_DURATION_MS,
    durationMs: CLIP_DURATION_MS,
    ...plan,
  };
}

function buildSnapshot(state: ArenaRuntimeState, now: number, agents: ArenaBattleAgentSnapshot[]): ArenaBattleSnapshot {
  const listeners = Object.keys(state.listeners).length;
  const leaderboard = getLeaderboard(agents);
  const leaderAgentId = leaderboard[0] ?? null;
  const currentEpochId = Number(getCurrentEpochId(now));

  return {
    arenaId: ARENA_ID,
    status: listeners > 0 ? "LIVE" : "IDLE",
    listeners,
    clipDurationMs: CLIP_DURATION_MS,
    clipGapMs: CLIP_GAP_MS,
    totalClipsPlayed: state.loop.processedClipCount,
    currentClipIndex: buildNowPlaying(state, now, agents)?.clipIndex ?? state.loop.processedClipCount,
    loopStartedAt: state.loop.startedAt,
    nowPlaying: buildNowPlaying(state, now, agents),
    agents,
    leaderboard,
    clipHistory: [...state.clipHistory],
    currentEpoch: {
      epochId: currentEpochId,
      startedAt: currentEpochId * EPOCH_MS,
      endsAt: (currentEpochId + 1) * EPOCH_MS,
      scoringRule: "Price Surge 55% + Volume 25% + Flow 10% + Liquidity 5% + Holder Flow 5%",
      leaderAgentId,
      projectedWinnerAgentId: leaderAgentId,
    },
    bettingMode: "awaiting_arena_abi",
    lastUpdatedAt: now,
  };
}

async function syncArena(now: number): Promise<ArenaBattleSnapshot> {
  const state = getArenaState();
  const staleChanged = pruneStaleListeners(state, now);
  const loopChanged = applyListenerDrivenLoop(state, now);

  const feed = await getArenaFeed(now, state);
  let agents = buildArenaAgents(state, feed);
  const simChanged = syncClipSimulation(state, now, agents);

  if (simChanged) {
    agents = buildArenaAgents(state, feed);
  }

  const snapshot = buildSnapshot(state, now, agents);

  if (staleChanged || loopChanged || simChanged) {
    global.__PHONK_ARENA_RUNTIME__ = state;
  }

  return snapshot;
}

export async function getArenaBattleSnapshot(now = Date.now()): Promise<ArenaBattleSnapshot> {
  return syncArena(now);
}

export async function joinArenaPresence(sessionIdRaw?: string): Promise<{ sessionId: string; snapshot: ArenaBattleSnapshot }> {
  const state = getArenaState();
  const now = Date.now();
  const sessionId = (sessionIdRaw || "").trim() || makeSessionId();

  state.listeners[sessionId] = now;
  const snapshot = await syncArena(now);

  return {
    sessionId,
    snapshot,
  };
}

export async function leaveArenaPresence(sessionIdRaw?: string): Promise<ArenaBattleSnapshot> {
  const state = getArenaState();
  const now = Date.now();
  const sessionId = (sessionIdRaw || "").trim();

  if (sessionId) {
    delete state.listeners[sessionId];
  }

  return syncArena(now);
}
