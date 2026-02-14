import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  AgentId,
  AgentState,
  AgentStrategy,
  AgentStyle,
  ClipHistoryItem,
  ClipOutcome,
  MatchSnapshot,
  NowPlayingClip,
} from "@/lib/types";

const LOBBY_ID = "arena-main";
const STATE_FILE = path.join(os.tmpdir(), "phonk-arena-match.json");

const CLIP_DURATION_MS = 10_000;
const LISTENER_TTL_MS = 30_000;
const HISTORY_LIMIT = 10;

interface RuntimeAgent {
  id: AgentId;
  personaName: string;
  baseStyle: AgentStyle;
  currentStyle: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensityBase: number;
  tempoPressure: number;
  volatility: number;
  clipsPlayed: number;
  wins: number;
  losses: number;
  lastJudgeScore: number | null;
}

interface LoopState {
  running: boolean;
  startedAt: number | null;
  runStartedAt: number | null;
  runStartElapsedMs: number;
  elapsedMs: number;
  processedClipCount: number;
}

interface StoredMatchState {
  lobbyId: string;
  matchId: string;
  listeners: Record<string, number>;
  loop: LoopState;
  agents: Record<AgentId, RuntimeAgent>;
  clipHistory: ClipHistoryItem[];
  createdAt: number;
  updatedAt: number;
}

interface ClipPlan {
  seed: string;
  style: AgentStyle;
  intensity: number;
  variation: number;
  judgeScore: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_STATE__: StoredMatchState | undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function hashSeed(seed: string): number {
  let h = 2166136261;

  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed;

  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeInitialAgents(): Record<AgentId, RuntimeAgent> {
  return {
    A: {
      id: "A",
      personaName: "Neon Wraith",
      baseStyle: "HARD",
      currentStyle: "HARD",
      strategy: "ADAPTIVE",
      confidence: 0.5,
      intensityBase: 0.63,
      tempoPressure: 0.45,
      volatility: 0.42,
      clipsPlayed: 0,
      wins: 0,
      losses: 0,
      lastJudgeScore: null,
    },
    B: {
      id: "B",
      personaName: "Midnight Serpent",
      baseStyle: "SOFT",
      currentStyle: "SOFT",
      strategy: "AGGRESSIVE",
      confidence: 0.5,
      intensityBase: 0.58,
      tempoPressure: 0.5,
      volatility: 0.46,
      clipsPlayed: 0,
      wins: 0,
      losses: 0,
      lastJudgeScore: null,
    },
  };
}

function defaultState(): StoredMatchState {
  const now = Date.now();

  return {
    lobbyId: LOBBY_ID,
    matchId: process.env.NEXT_PUBLIC_MATCH_ID ?? "MONAD-MAIN-001",
    listeners: {},
    loop: {
      running: false,
      startedAt: null,
      runStartedAt: null,
      runStartElapsedMs: 0,
      elapsedMs: 0,
      processedClipCount: 0,
    },
    agents: makeInitialAgents(),
    clipHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function writeState(state: StoredMatchState): Promise<void> {
  state.updatedAt = Date.now();
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  global.__PHONK_ARENA_STATE__ = state;
}

async function loadState(): Promise<StoredMatchState> {
  if (global.__PHONK_ARENA_STATE__) {
    return global.__PHONK_ARENA_STATE__;
  }

  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredMatchState;

    if (!parsed.listeners) {
      parsed.listeners = {};
    }

    if (!parsed.loop) {
      parsed.loop = defaultState().loop;
    }

    if (!parsed.agents || !parsed.agents.A || !parsed.agents.B) {
      parsed.agents = makeInitialAgents();
    }

    parsed.clipHistory = parsed.clipHistory ?? [];

    global.__PHONK_ARENA_STATE__ = parsed;
    return parsed;
  } catch {
    const initial = defaultState();
    await writeState(initial);
    return initial;
  }
}

function getActiveElapsedMs(state: StoredMatchState, now: number): number {
  if (!state.loop.running || state.loop.runStartedAt === null) {
    return state.loop.elapsedMs;
  }

  return state.loop.runStartElapsedMs + (now - state.loop.runStartedAt);
}

function activeAgentForClip(clipIndex: number): AgentId {
  return clipIndex % 2 === 0 ? "A" : "B";
}

function computeClipPlan(agent: RuntimeAgent, matchId: string, clipIndex: number): ClipPlan {
  const seed = `${matchId}:${clipIndex}:${agent.id}`;
  const rand = mulberry32(hashSeed(seed));

  const styleBias = agent.currentStyle === "HARD" ? 0.08 : -0.05;
  const strategyBias =
    agent.strategy === "AGGRESSIVE" ? 0.08 : agent.strategy === "SAFE" ? -0.03 : 0.01;
  const confidenceBias = (agent.confidence - 0.5) * 0.22;
  const randomSwing = (rand() - 0.5) * agent.volatility * 0.35;

  const intensity = clamp(
    agent.intensityBase + styleBias + strategyBias + confidenceBias + randomSwing,
    0.2,
    0.98,
  );

  const variation = clamp(
    0.28 +
      agent.confidence * 0.32 +
      agent.volatility * 0.31 +
      (agent.strategy === "ADAPTIVE" ? 0.08 : 0) +
      rand() * 0.2,
    0.12,
    1,
  );

  const intensityTarget = agent.currentStyle === "HARD" ? 0.75 : 0.58;
  const intensityScore = clamp(100 - Math.abs(intensity - intensityTarget) * 170, 48, 100);

  const variationScore = clamp(50 + variation * 43 + rand() * 7, 45, 100);

  const chaos = clamp(
    (intensity > 0.84 ? (intensity - 0.84) * 2.2 : 0) +
      Math.max(0, variation - 0.79) +
      (agent.strategy === "AGGRESSIVE" ? 0.08 : 0) +
      rand() * 0.18,
    0,
    1,
  );

  const stabilityScore = clamp(99 - chaos * 58 - Math.abs(intensity - 0.64) * 32, 36, 100);

  const judgeScore = round1(intensityScore * 0.42 + variationScore * 0.33 + stabilityScore * 0.25);

  return {
    seed,
    style: agent.currentStyle,
    intensity: round3(intensity),
    variation: round3(variation),
    judgeScore,
  };
}

function evaluateOutcome(score: number, opponentScore: number | null): ClipOutcome {
  if (opponentScore === null) {
    return "OPENING";
  }

  if (score > opponentScore + 1.2) {
    return "WIN";
  }

  if (score < opponentScore - 1.2) {
    return "LOSS";
  }

  return "TIE";
}

function applyAdaptation(
  agent: RuntimeAgent,
  outcome: ClipOutcome,
  matchId: string,
  clipIndex: number,
): string {
  const rand = mulberry32(hashSeed(`${matchId}:${clipIndex}:${agent.id}:adapt`));

  if (outcome === "OPENING") {
    agent.confidence = clamp(agent.confidence + 0.01, 0.2, 0.94);
    return "Opening move, setting baseline pressure.";
  }

  if (outcome === "WIN") {
    agent.wins += 1;
    agent.confidence = clamp(agent.confidence + 0.05, 0.2, 0.96);
    agent.intensityBase = clamp(agent.intensityBase + 0.015, 0.2, 0.92);
    agent.tempoPressure = clamp(agent.tempoPressure + 0.02, 0.2, 0.98);

    if (rand() > 0.9) {
      agent.currentStyle = agent.currentStyle === "HARD" ? "SOFT" : "HARD";
      return "Winning and exploring a surprise style flip.";
    }

    return "Winning streak, reinforcing current groove.";
  }

  if (outcome === "LOSS") {
    agent.losses += 1;
    agent.confidence = clamp(agent.confidence - 0.055, 0.2, 0.92);

    if (agent.strategy === "ADAPTIVE") {
      agent.currentStyle = agent.currentStyle === "HARD" ? "SOFT" : "HARD";
      agent.tempoPressure = clamp(agent.tempoPressure + 0.03, 0.2, 0.98);
      return "Adaptive loss response: switching style for next clip.";
    }

    if (agent.strategy === "AGGRESSIVE") {
      agent.intensityBase = clamp(agent.intensityBase + 0.08, 0.2, 0.95);
      agent.volatility = clamp(agent.volatility + 0.05, 0.15, 0.95);
      agent.tempoPressure = clamp(agent.tempoPressure + 0.08, 0.2, 0.99);
      return "Aggressive response: pushing intensity and tempo pressure.";
    }

    agent.volatility = clamp(agent.volatility - 0.08, 0.1, 0.75);
    agent.intensityBase = clamp(agent.intensityBase - 0.02, 0.2, 0.9);
    return "Safe response: reducing volatility and stabilizing pattern.";
  }

  agent.confidence = clamp(agent.confidence + 0.01, 0.2, 0.94);
  agent.volatility = clamp(agent.volatility + (rand() - 0.5) * 0.03, 0.1, 0.9);
  return "Tie result: subtle micro-adjustments.";
}

function toAgentState(agent: RuntimeAgent): AgentState {
  return {
    id: agent.id,
    personaName: agent.personaName,
    baseStyle: agent.baseStyle,
    currentStyle: agent.currentStyle,
    strategy: agent.strategy,
    confidence: round3(agent.confidence),
    intensity: round3(agent.intensityBase),
    clipsPlayed: agent.clipsPlayed,
    wins: agent.wins,
    losses: agent.losses,
    lastJudgeScore: agent.lastJudgeScore,
  };
}

function resumeLoop(state: StoredMatchState, now: number): boolean {
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

function pauseLoop(state: StoredMatchState, now: number): boolean {
  if (!state.loop.running || state.loop.runStartedAt === null) {
    return false;
  }

  const activeElapsed = state.loop.runStartElapsedMs + (now - state.loop.runStartedAt);
  const snappedElapsed = Math.floor(activeElapsed / CLIP_DURATION_MS) * CLIP_DURATION_MS;

  state.loop.elapsedMs = snappedElapsed;
  state.loop.running = false;
  state.loop.runStartedAt = null;
  state.loop.runStartElapsedMs = snappedElapsed;

  return true;
}

function processCompletedClip(state: StoredMatchState, clipIndex: number, now: number): boolean {
  if (state.loop.runStartedAt === null) {
    return false;
  }

  const agentId = activeAgentForClip(clipIndex);
  const opponentId: AgentId = agentId === "A" ? "B" : "A";

  const agent = state.agents[agentId];
  const opponent = state.agents[opponentId];

  const plan = computeClipPlan(agent, state.matchId, clipIndex);
  const outcome = evaluateOutcome(plan.judgeScore, opponent.lastJudgeScore);
  const note = applyAdaptation(agent, outcome, state.matchId, clipIndex);

  const clipStartElapsed = clipIndex * CLIP_DURATION_MS;
  const clipStartedAt = state.loop.runStartedAt + (clipStartElapsed - state.loop.runStartElapsedMs);

  const historyItem: ClipHistoryItem = {
    clipId: `${state.matchId}-${clipIndex}`,
    clipIndex,
    agentId,
    seed: plan.seed,
    startedAt: clipStartedAt,
    endedAt: clipStartedAt + CLIP_DURATION_MS,
    style: plan.style,
    strategy: agent.strategy,
    confidence: round3(agent.confidence),
    intensity: plan.intensity,
    judgeScore: plan.judgeScore,
    outcome,
    note,
  };

  state.clipHistory.unshift(historyItem);
  state.clipHistory = state.clipHistory.slice(0, HISTORY_LIMIT);

  agent.clipsPlayed += 1;
  agent.lastJudgeScore = plan.judgeScore;

  if (outcome === "WIN") {
    opponent.losses += 1;
  } else if (outcome === "LOSS") {
    opponent.wins += 1;
  }

  state.loop.processedClipCount += 1;

  return historyItem.startedAt <= now + 1_000;
}

function syncClipSimulation(state: StoredMatchState, now: number): boolean {
  if (!state.loop.running) {
    return false;
  }

  const activeElapsed = getActiveElapsedMs(state, now);
  const completedClipCount = Math.floor(activeElapsed / CLIP_DURATION_MS);

  let changed = false;

  while (state.loop.processedClipCount < completedClipCount) {
    processCompletedClip(state, state.loop.processedClipCount, now);
    changed = true;
  }

  return changed;
}

function pruneStaleListeners(state: StoredMatchState, now: number): boolean {
  let changed = false;

  for (const [sessionId, touchedAt] of Object.entries(state.listeners)) {
    if (now - touchedAt > LISTENER_TTL_MS) {
      delete state.listeners[sessionId];
      changed = true;
    }
  }

  return changed;
}

function applyListenerDrivenLoop(state: StoredMatchState, now: number): boolean {
  const listenerCount = Object.keys(state.listeners).length;

  if (listenerCount > 0) {
    return resumeLoop(state, now);
  }

  return pauseLoop(state, now);
}

function buildNowPlaying(state: StoredMatchState, now: number): NowPlayingClip | null {
  if (!state.loop.running) {
    return null;
  }

  const activeElapsed = getActiveElapsedMs(state, now);
  const clipIndex = Math.floor(activeElapsed / CLIP_DURATION_MS);
  const clipOffset = activeElapsed % CLIP_DURATION_MS;
  const agentId = activeAgentForClip(clipIndex);
  const agent = state.agents[agentId];
  const plan = computeClipPlan(agent, state.matchId, clipIndex);

  const startedAt = now - clipOffset;

  return {
    clipId: `${state.matchId}-${clipIndex}`,
    clipIndex,
    agentId,
    seed: plan.seed,
    startedAt,
    endsAt: startedAt + CLIP_DURATION_MS,
    durationMs: CLIP_DURATION_MS,
    style: plan.style,
    strategy: agent.strategy,
    confidence: round3(agent.confidence),
    intensity: plan.intensity,
  };
}

function buildSnapshot(state: StoredMatchState, now: number): MatchSnapshot {
  const listenerCount = Object.keys(state.listeners).length;
  const nowPlaying = buildNowPlaying(state, now);

  return {
    lobbyId: state.lobbyId,
    matchId: state.matchId,
    status: listenerCount > 0 ? "LIVE" : "IDLE",
    phase: nowPlaying
      ? nowPlaying.agentId === "A"
        ? "A_PLAYING"
        : "B_PLAYING"
      : "IDLE",
    listeners: listenerCount,
    clipDurationMs: CLIP_DURATION_MS,
    totalClipsPlayed: state.loop.processedClipCount,
    currentClipIndex: nowPlaying?.clipIndex ?? state.loop.processedClipCount,
    loopStartedAt: state.loop.startedAt,
    nowPlaying,
    clipHistory: [...state.clipHistory],
    agents: [toAgentState(state.agents.A), toAgentState(state.agents.B)],
    lastUpdatedAt: now,
  };
}

function parseSessionId(sessionId: string | undefined): string | null {
  const candidate = (sessionId ?? "").trim();

  if (/^[a-zA-Z0-9_-]{8,128}$/.test(candidate)) {
    return candidate;
  }

  return null;
}

async function syncAndSnapshot(state: StoredMatchState, now: number): Promise<MatchSnapshot> {
  const staleChanged = pruneStaleListeners(state, now);
  const simChanged = syncClipSimulation(state, now);
  const loopChanged = applyListenerDrivenLoop(state, now);

  const snapshot = buildSnapshot(state, now);

  if (staleChanged || loopChanged || simChanged) {
    await writeState(state);
  }

  return snapshot;
}

export async function getMatchSnapshot(now = Date.now()): Promise<MatchSnapshot> {
  const state = await loadState();
  return syncAndSnapshot(state, now);
}

export async function joinPresence(sessionIdRaw?: string): Promise<{ sessionId: string; snapshot: MatchSnapshot }> {
  const state = await loadState();
  const now = Date.now();
  const sessionId =
    parseSessionId(sessionIdRaw) ??
    `session_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;

  state.listeners[sessionId] = now;

  const snapshot = await syncAndSnapshot(state, now);

  return { sessionId, snapshot };
}

export async function leavePresence(sessionIdRaw?: string): Promise<MatchSnapshot> {
  const state = await loadState();
  const now = Date.now();
  const sessionId = parseSessionId(sessionIdRaw);

  if (sessionId) {
    delete state.listeners[sessionId];
  }

  return syncAndSnapshot(state, now);
}

export async function startMatch(): Promise<MatchSnapshot> {
  const state = await loadState();
  const now = Date.now();

  state.agents = makeInitialAgents();
  state.clipHistory = [];
  state.loop = {
    running: false,
    startedAt: null,
    runStartedAt: null,
    runStartElapsedMs: 0,
    elapsedMs: 0,
    processedClipCount: 0,
  };

  if (Object.keys(state.listeners).length > 0) {
    resumeLoop(state, now);
  }

  await writeState(state);

  return buildSnapshot(state, now);
}

export async function resetMatch(): Promise<MatchSnapshot> {
  const state = await loadState();
  const now = Date.now();

  state.listeners = {};
  state.agents = makeInitialAgents();
  state.clipHistory = [];
  state.loop = {
    running: false,
    startedAt: null,
    runStartedAt: null,
    runStartElapsedMs: 0,
    elapsedMs: 0,
    processedClipCount: 0,
  };

  await writeState(state);

  return buildSnapshot(state, now);
}
