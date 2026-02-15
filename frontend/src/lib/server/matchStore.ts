import "server-only";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getDefaultLobbyId, getLobbyConfig, isLobbyId, LOBBY_IDS } from "@/lib/lobbies";
import type {
  AgentId,
  AgentState,
  AgentStrategy,
  AgentStyle,
  BetResult,
  ClipHistoryItem,
  ClipVoteTally,
  EpochHistoryEntry,
  LobbyId,
  MatchSnapshot,
  NowPlayingClip,
  ViewerBetSnapshot,
  VoteResult,
  VoteSide,
  VoteWinner,
} from "@/lib/types";

const CLIP_DURATION_MS = 10_000;
const CLIP_GAP_MS = 2_500;
const CLIP_SLOT_MS = CLIP_DURATION_MS + CLIP_GAP_MS;
const LISTENER_TTL_MS = 30_000;
const HISTORY_LIMIT = 10;
const VOTE_RETENTION_CLIPS = 30;
const EPOCH_HISTORY_LIMIT = 5;
const EPOCH_DURATION_SECONDS = 3_600;
const EPOCH_DURATION_MS = EPOCH_DURATION_SECONDS * 1_000;
const DEFAULT_BANKROLL = 100;
const EPOCH_REWARD_FACTOR = 3.5;
const EPOCH_PENALTY_FACTOR = 2.2;

interface RuntimeAgent {
  id: AgentId;
  personaName: string;
  baseStyle: AgentStyle;
  currentStyle: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensityBase: number;
  volatility: number;
  tempoPressure: number;
  mutationSensitivity: number;
  bankroll: number;
  riskLevel: number;
  winCount: number;
  lossCount: number;
  clipsPlayed: number;
  wins: number;
  losses: number;
}

interface ClipVoteState {
  clipId: string;
  votes: Record<string, VoteSide>;
  aVotes: number;
  bVotes: number;
}

interface LoopState {
  running: boolean;
  startedAt: number | null;
  runStartedAt: number | null;
  runStartElapsedMs: number;
  elapsedMs: number;
  processedClipCount: number;
}

interface StoredEpochAggregate {
  epochId: number;
  votesA: number;
  votesB: number;
  totalBetAWei: string;
  totalBetBWei: string;
  winner: VoteWinner | null;
  finalizedAt: number | null;
}

interface StoredUserEpochBet {
  amountAWei: string;
  amountBWei: string;
  claimed: boolean;
}

interface StoredLobbyState {
  lobbyId: LobbyId;
  matchId: string;
  listeners: Record<string, number>;
  loop: LoopState;
  agents: Record<AgentId, RuntimeAgent>;
  clipHistory: ClipHistoryItem[];
  votesByClip: Record<string, ClipVoteState>;
  epochAggregates: Record<string, StoredEpochAggregate>;
  userBetsByEpoch: Record<string, Record<string, StoredUserEpochBet>>;
  epochHistory: EpochHistoryEntry[];
  lastEpochId: number | null;
  createdAt: number;
  updatedAt: number;
}

interface ClipPlan {
  seed: string;
  style: AgentStyle;
  intensity: number;
  bpm: number;
  patternDensity: number;
  distortion: number;
  mutationLevel: number;
  fxChance: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __PHONK_ARENA_LOBBIES__: Partial<Record<LobbyId, StoredLobbyState>> | undefined;
}

function getStateCache(): Partial<Record<LobbyId, StoredLobbyState>> {
  if (!global.__PHONK_ARENA_LOBBIES__) {
    global.__PHONK_ARENA_LOBBIES__ = {};
  }

  return global.__PHONK_ARENA_LOBBIES__;
}

function stateFilePath(lobbyId: LobbyId): string {
  return path.join(os.tmpdir(), `phonk-arena-lobby-${lobbyId}.json`);
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

function parseSessionId(sessionId: string | undefined): string | null {
  const candidate = (sessionId ?? "").trim();

  if (/^[a-zA-Z0-9_-]{8,128}$/.test(candidate)) {
    return candidate;
  }

  return null;
}

function makeMatchId(lobbyId: LobbyId): string {
  const base = process.env.NEXT_PUBLIC_MATCH_ID ?? "MONAD-LIVE";
  return `${base}-${lobbyId.toUpperCase()}`;
}

function epochIdFromMs(now: number): number {
  return Math.floor(now / 1000 / EPOCH_DURATION_SECONDS);
}

function epochStartMs(epochId: number): number {
  return epochId * EPOCH_DURATION_MS;
}

function epochEndMs(epochId: number): number {
  return (epochId + 1) * EPOCH_DURATION_MS;
}

function epochKey(epochId: number): string {
  return String(epochId);
}

function isAddressLike(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAddress(value: string | undefined): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return isAddressLike(normalized) ? normalized : null;
}

function isWeiLike(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function safeWei(value: unknown): string {
  if (typeof value !== "string") {
    return "0";
  }

  return isWeiLike(value) ? value : "0";
}

function addWei(a: string, b: string): string {
  return (BigInt(safeWei(a)) + BigInt(safeWei(b))).toString();
}

function createRuntimeAgent(
  agentId: AgentId,
  lobbyId: LobbyId,
  params: {
    personaName: string;
    baseStyle: AgentStyle;
    strategy: AgentStrategy;
  },
): RuntimeAgent {
  const lobby = getLobbyConfig(lobbyId);
  const rangeMid = (lobby.parameters.intensityRange.min + lobby.parameters.intensityRange.max) / 2;
  const stylePush = params.baseStyle === "HARD" ? 0.06 : -0.05;
  const strategyPush =
    params.strategy === "AGGRESSIVE" ? 0.08 : params.strategy === "SAFE" ? -0.04 : 0.01;
  const riskBase =
    params.strategy === "AGGRESSIVE" ? 0.62 : params.strategy === "SAFE" ? 0.34 : 0.5;

  return {
    id: agentId,
    personaName: params.personaName,
    baseStyle: params.baseStyle,
    currentStyle: params.baseStyle,
    strategy: params.strategy,
    confidence: 0.5,
    intensityBase: clamp(
      rangeMid + stylePush + strategyPush,
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    ),
    volatility:
      params.strategy === "SAFE"
        ? 0.28
        : params.strategy === "ADAPTIVE"
          ? 0.45
          : 0.55,
    tempoPressure: params.strategy === "AGGRESSIVE" ? 0.62 : 0.5,
    mutationSensitivity: clamp(
      lobby.parameters.mutationSensitivity + (params.strategy === "ADAPTIVE" ? 0.08 : 0),
      0.1,
      1,
    ),
    bankroll: DEFAULT_BANKROLL,
    riskLevel: clamp(riskBase, 0.08, 0.99),
    winCount: 0,
    lossCount: 0,
    clipsPlayed: 0,
    wins: 0,
    losses: 0,
  };
}

function makeInitialAgents(lobbyId: LobbyId): Record<AgentId, RuntimeAgent> {
  const lobby = getLobbyConfig(lobbyId);

  return {
    A: createRuntimeAgent("A", lobbyId, lobby.agentA),
    B: createRuntimeAgent("B", lobbyId, lobby.agentB),
  };
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

function emptyEpochAggregate(epochId: number): StoredEpochAggregate {
  return {
    epochId,
    votesA: 0,
    votesB: 0,
    totalBetAWei: "0",
    totalBetBWei: "0",
    winner: null,
    finalizedAt: null,
  };
}

function defaultLobbyState(lobbyId: LobbyId): StoredLobbyState {
  const now = Date.now();
  const currentEpochId = epochIdFromMs(now);

  return {
    lobbyId,
    matchId: makeMatchId(lobbyId),
    listeners: {},
    loop: defaultLoopState(),
    agents: makeInitialAgents(lobbyId),
    clipHistory: [],
    votesByClip: {},
    epochAggregates: {
      [epochKey(currentEpochId)]: emptyEpochAggregate(currentEpochId),
    },
    userBetsByEpoch: {},
    epochHistory: [],
    lastEpochId: currentEpochId,
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeListeners(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output: Record<string, number> = {};

  for (const [sessionId, touchedAt] of Object.entries(input)) {
    if (parseSessionId(sessionId) && typeof touchedAt === "number" && Number.isFinite(touchedAt)) {
      output[sessionId] = touchedAt;
    }
  }

  return output;
}

function sanitizeAgent(input: unknown, fallback: RuntimeAgent, lobbyId: LobbyId): RuntimeAgent {
  const lobby = getLobbyConfig(lobbyId);

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const source = input as Partial<RuntimeAgent>;

  return {
    id: fallback.id,
    personaName: typeof source.personaName === "string" ? source.personaName : fallback.personaName,
    baseStyle:
      source.baseStyle === "HARD" || source.baseStyle === "SOFT"
        ? source.baseStyle
        : fallback.baseStyle,
    currentStyle:
      source.currentStyle === "HARD" || source.currentStyle === "SOFT"
        ? source.currentStyle
        : fallback.currentStyle,
    strategy:
      source.strategy === "AGGRESSIVE" || source.strategy === "ADAPTIVE" || source.strategy === "SAFE"
        ? source.strategy
        : fallback.strategy,
    confidence:
      typeof source.confidence === "number" ? clamp(source.confidence, 0.1, 0.99) : fallback.confidence,
    intensityBase:
      typeof source.intensityBase === "number"
        ? clamp(
            source.intensityBase,
            lobby.parameters.intensityRange.min,
            lobby.parameters.intensityRange.max,
          )
        : fallback.intensityBase,
    volatility:
      typeof source.volatility === "number" ? clamp(source.volatility, 0.08, 0.98) : fallback.volatility,
    tempoPressure:
      typeof source.tempoPressure === "number"
        ? clamp(source.tempoPressure, 0.1, 0.99)
        : fallback.tempoPressure,
    mutationSensitivity:
      typeof source.mutationSensitivity === "number"
        ? clamp(source.mutationSensitivity, 0.08, 1)
        : fallback.mutationSensitivity,
    bankroll:
      typeof source.bankroll === "number"
        ? Math.max(0, source.bankroll)
        : fallback.bankroll,
    riskLevel:
      typeof source.riskLevel === "number"
        ? clamp(source.riskLevel, 0.08, 0.99)
        : fallback.riskLevel,
    winCount:
      typeof source.winCount === "number"
        ? Math.max(0, Math.floor(source.winCount))
        : fallback.winCount,
    lossCount:
      typeof source.lossCount === "number"
        ? Math.max(0, Math.floor(source.lossCount))
        : fallback.lossCount,
    clipsPlayed:
      typeof source.clipsPlayed === "number"
        ? Math.max(0, Math.floor(source.clipsPlayed))
        : fallback.clipsPlayed,
    wins: typeof source.wins === "number" ? Math.max(0, Math.floor(source.wins)) : fallback.wins,
    losses: typeof source.losses === "number" ? Math.max(0, Math.floor(source.losses)) : fallback.losses,
  };
}

function sanitizeLoop(input: unknown): LoopState {
  const fallback = defaultLoopState();

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const source = input as Partial<LoopState>;

  return {
    running: Boolean(source.running),
    startedAt: typeof source.startedAt === "number" ? source.startedAt : null,
    runStartedAt: typeof source.runStartedAt === "number" ? source.runStartedAt : null,
    runStartElapsedMs:
      typeof source.runStartElapsedMs === "number" && Number.isFinite(source.runStartElapsedMs)
        ? Math.max(0, source.runStartElapsedMs)
        : 0,
    elapsedMs:
      typeof source.elapsedMs === "number" && Number.isFinite(source.elapsedMs)
        ? Math.max(0, source.elapsedMs)
        : 0,
    processedClipCount:
      typeof source.processedClipCount === "number" && Number.isFinite(source.processedClipCount)
        ? Math.max(0, Math.floor(source.processedClipCount))
        : 0,
  };
}

function sanitizeVoteState(input: unknown): Record<string, ClipVoteState> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output: Record<string, ClipVoteState> = {};

  for (const [clipId, value] of Object.entries(input)) {
    if (!clipId || typeof value !== "object" || value === null) {
      continue;
    }

    const state = value as Partial<ClipVoteState>;
    const votes: Record<string, VoteSide> = {};
    let aVotes = 0;
    let bVotes = 0;

    for (const [address, side] of Object.entries(state.votes ?? {})) {
      const normalized = normalizeAddress(address);
      if (!normalized) {
        continue;
      }

      if (side === "A" || side === "B") {
        votes[normalized] = side;
        if (side === "A") {
          aVotes += 1;
        } else {
          bVotes += 1;
        }
      }
    }

    output[clipId] = {
      clipId,
      votes,
      aVotes,
      bVotes,
    };
  }

  return output;
}

function sanitizeClipHistory(input: unknown): ClipHistoryItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const history: ClipHistoryItem[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const item = raw as Partial<ClipHistoryItem>;

    if (
      typeof item.clipId !== "string" ||
      typeof item.clipIndex !== "number" ||
      (item.agentId !== "A" && item.agentId !== "B")
    ) {
      continue;
    }

    const voteTally: ClipVoteTally = {
      clipId: typeof item.voteTally?.clipId === "string" ? item.voteTally.clipId : item.clipId,
      aVotes:
        typeof item.voteTally?.aVotes === "number"
          ? Math.max(0, Math.floor(item.voteTally.aVotes))
          : 0,
      bVotes:
        typeof item.voteTally?.bVotes === "number"
          ? Math.max(0, Math.floor(item.voteTally.bVotes))
          : 0,
      winner:
        item.voteTally?.winner === "A" ||
        item.voteTally?.winner === "B" ||
        item.voteTally?.winner === "TIE"
          ? item.voteTally.winner
          : "TIE",
    };

    const startedAt = typeof item.startedAt === "number" ? item.startedAt : Date.now();

    history.push({
      clipId: item.clipId,
      clipIndex: Math.max(0, Math.floor(item.clipIndex)),
      epochId:
        typeof item.epochId === "number" ? Math.max(0, Math.floor(item.epochId)) : epochIdFromMs(startedAt),
      agentId: item.agentId,
      seed: typeof item.seed === "string" ? item.seed : "",
      startedAt,
      endedAt: typeof item.endedAt === "number" ? item.endedAt : Date.now(),
      style: item.style === "HARD" || item.style === "SOFT" ? item.style : "HARD",
      strategy:
        item.strategy === "AGGRESSIVE" || item.strategy === "ADAPTIVE" || item.strategy === "SAFE"
          ? item.strategy
          : "ADAPTIVE",
      confidence: typeof item.confidence === "number" ? clamp(item.confidence, 0, 1) : 0.5,
      intensity: typeof item.intensity === "number" ? clamp(item.intensity, 0, 1) : 0.5,
      bpm: typeof item.bpm === "number" ? item.bpm : 140,
      patternDensity:
        typeof item.patternDensity === "number" ? clamp(item.patternDensity, 0, 1) : 0.5,
      distortion: typeof item.distortion === "number" ? clamp(item.distortion, 0, 1) : 0.3,
      mutationLevel:
        typeof item.mutationLevel === "number" ? clamp(item.mutationLevel, 0, 1) : 0.5,
      fxChance: typeof item.fxChance === "number" ? clamp(item.fxChance, 0, 1) : 0.2,
      voteTally,
      note: typeof item.note === "string" ? item.note : "",
    });
  }

  return history.slice(0, HISTORY_LIMIT);
}

function sanitizeEpochAggregate(input: unknown, epochId: number): StoredEpochAggregate {
  if (!input || typeof input !== "object") {
    return emptyEpochAggregate(epochId);
  }

  const source = input as Partial<StoredEpochAggregate>;
  return {
    epochId,
    votesA: typeof source.votesA === "number" ? Math.max(0, Math.floor(source.votesA)) : 0,
    votesB: typeof source.votesB === "number" ? Math.max(0, Math.floor(source.votesB)) : 0,
    totalBetAWei: safeWei(source.totalBetAWei),
    totalBetBWei: safeWei(source.totalBetBWei),
    winner:
      source.winner === "A" || source.winner === "B" || source.winner === "TIE"
        ? source.winner
        : null,
    finalizedAt: typeof source.finalizedAt === "number" ? source.finalizedAt : null,
  };
}

function sanitizeEpochAggregates(input: unknown): Record<string, StoredEpochAggregate> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output: Record<string, StoredEpochAggregate> = {};
  for (const [key, value] of Object.entries(input)) {
    const parsed = Number(key);
    if (!Number.isFinite(parsed) || parsed < 0) {
      continue;
    }

    output[key] = sanitizeEpochAggregate(value, Math.floor(parsed));
  }

  return output;
}

function sanitizeUserBets(input: unknown): Record<string, Record<string, StoredUserEpochBet>> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output: Record<string, Record<string, StoredUserEpochBet>> = {};

  for (const [epoch, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const epochBets: Record<string, StoredUserEpochBet> = {};
    for (const [address, betValue] of Object.entries(value)) {
      const normalized = normalizeAddress(address);
      if (!normalized || !betValue || typeof betValue !== "object") {
        continue;
      }

      const source = betValue as Partial<StoredUserEpochBet>;
      epochBets[normalized] = {
        amountAWei: safeWei(source.amountAWei),
        amountBWei: safeWei(source.amountBWei),
        claimed: Boolean(source.claimed),
      };
    }

    output[epoch] = epochBets;
  }

  return output;
}

function sanitizeEpochHistory(input: unknown): EpochHistoryEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const output: EpochHistoryEntry[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const item = raw as Partial<EpochHistoryEntry>;
    if (
      typeof item.epochId !== "number" ||
      (item.winner !== "A" && item.winner !== "B" && item.winner !== "TIE")
    ) {
      continue;
    }

    output.push({
      epochId: Math.max(0, Math.floor(item.epochId)),
      winner: item.winner,
      votesA: typeof item.votesA === "number" ? Math.max(0, Math.floor(item.votesA)) : 0,
      votesB: typeof item.votesB === "number" ? Math.max(0, Math.floor(item.votesB)) : 0,
      totalBetAWei: safeWei(item.totalBetAWei),
      totalBetBWei: safeWei(item.totalBetBWei),
      timestamp: typeof item.timestamp === "number" ? item.timestamp : Date.now(),
      agentPerformance: {
        A: {
          bankroll:
            typeof item.agentPerformance?.A?.bankroll === "number"
              ? item.agentPerformance.A.bankroll
              : DEFAULT_BANKROLL,
          wins:
            typeof item.agentPerformance?.A?.wins === "number"
              ? Math.max(0, Math.floor(item.agentPerformance.A.wins))
              : 0,
          losses:
            typeof item.agentPerformance?.A?.losses === "number"
              ? Math.max(0, Math.floor(item.agentPerformance.A.losses))
              : 0,
          riskLevel:
            typeof item.agentPerformance?.A?.riskLevel === "number"
              ? clamp(item.agentPerformance.A.riskLevel, 0.08, 0.99)
              : 0.5,
        },
        B: {
          bankroll:
            typeof item.agentPerformance?.B?.bankroll === "number"
              ? item.agentPerformance.B.bankroll
              : DEFAULT_BANKROLL,
          wins:
            typeof item.agentPerformance?.B?.wins === "number"
              ? Math.max(0, Math.floor(item.agentPerformance.B.wins))
              : 0,
          losses:
            typeof item.agentPerformance?.B?.losses === "number"
              ? Math.max(0, Math.floor(item.agentPerformance.B.losses))
              : 0,
          riskLevel:
            typeof item.agentPerformance?.B?.riskLevel === "number"
              ? clamp(item.agentPerformance.B.riskLevel, 0.08, 0.99)
              : 0.5,
        },
      },
    });
  }

  return output.slice(0, EPOCH_HISTORY_LIMIT);
}

function hydrateLobbyState(lobbyId: LobbyId, raw: unknown): StoredLobbyState {
  const fallback = defaultLobbyState(lobbyId);

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const source = raw as Partial<StoredLobbyState>;
  const nowEpoch = epochIdFromMs(Date.now());
  const epochAggregates = sanitizeEpochAggregates(source.epochAggregates);
  if (!epochAggregates[epochKey(nowEpoch)]) {
    epochAggregates[epochKey(nowEpoch)] = emptyEpochAggregate(nowEpoch);
  }

  return {
    lobbyId,
    matchId: typeof source.matchId === "string" ? source.matchId : fallback.matchId,
    listeners: sanitizeListeners(source.listeners),
    loop: sanitizeLoop(source.loop),
    agents: {
      A: sanitizeAgent(source.agents?.A, fallback.agents.A, lobbyId),
      B: sanitizeAgent(source.agents?.B, fallback.agents.B, lobbyId),
    },
    clipHistory: sanitizeClipHistory(source.clipHistory),
    votesByClip: sanitizeVoteState(source.votesByClip),
    epochAggregates,
    userBetsByEpoch: sanitizeUserBets(source.userBetsByEpoch),
    epochHistory: sanitizeEpochHistory(source.epochHistory),
    lastEpochId:
      typeof source.lastEpochId === "number" ? Math.max(0, Math.floor(source.lastEpochId)) : nowEpoch,
    createdAt: typeof source.createdAt === "number" ? source.createdAt : fallback.createdAt,
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : fallback.updatedAt,
  };
}

async function writeLobbyState(state: StoredLobbyState): Promise<void> {
  state.updatedAt = Date.now();
  await fs.writeFile(stateFilePath(state.lobbyId), JSON.stringify(state, null, 2), "utf8");
  getStateCache()[state.lobbyId] = state;
}

async function loadLobbyState(lobbyId: LobbyId): Promise<StoredLobbyState> {
  const cache = getStateCache();

  if (cache[lobbyId]) {
    return cache[lobbyId] as StoredLobbyState;
  }

  try {
    const raw = await fs.readFile(stateFilePath(lobbyId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const hydrated = hydrateLobbyState(lobbyId, parsed);

    cache[lobbyId] = hydrated;
    return hydrated;
  } catch {
    const initial = defaultLobbyState(lobbyId);
    await writeLobbyState(initial);
    return initial;
  }
}

function resolveLobbyIdOrThrow(input: string | undefined | null): LobbyId {
  if (input && isLobbyId(input)) {
    return input;
  }

  if (!input) {
    return getDefaultLobbyId();
  }

  throw new Error("Unknown lobbyId.");
}

function activeAgentForClip(clipIndex: number): AgentId {
  return clipIndex % 2 === 0 ? "A" : "B";
}

function getActiveElapsedMs(state: StoredLobbyState, now: number): number {
  if (!state.loop.running || state.loop.runStartedAt === null) {
    return state.loop.elapsedMs;
  }

  return state.loop.runStartElapsedMs + (now - state.loop.runStartedAt);
}

function ensureEpochAggregate(state: StoredLobbyState, epochId: number): StoredEpochAggregate {
  const key = epochKey(epochId);
  const existing = state.epochAggregates[key];

  if (existing) {
    return existing;
  }

  const created = emptyEpochAggregate(epochId);
  state.epochAggregates[key] = created;
  return created;
}

function computeClipPlan(state: StoredLobbyState, agent: RuntimeAgent, clipIndex: number): ClipPlan {
  const lobby = getLobbyConfig(state.lobbyId);
  const seed = `${state.lobbyId}:${state.matchId}:${clipIndex}:${agent.id}`;
  const rand = mulberry32(hashSeed(seed));

  let style: AgentStyle = agent.currentStyle;

  if (lobby.parameters.styleBias > 0.45 && style === "SOFT" && rand() < lobby.parameters.styleBias * 0.2) {
    style = "HARD";
  }

  if (
    lobby.parameters.styleBias < -0.45 &&
    style === "HARD" &&
    rand() < Math.abs(lobby.parameters.styleBias) * 0.2
  ) {
    style = "SOFT";
  }

  const styleBias = style === "HARD" ? 0.08 : -0.06;
  const strategyBias =
    agent.strategy === "AGGRESSIVE" ? 0.09 : agent.strategy === "SAFE" ? -0.04 : 0.01;
  const confidenceBias = (agent.confidence - 0.5) * 0.26;
  const riskBias = (agent.riskLevel - 0.5) * 0.2;
  const volatilitySwing = (rand() - 0.5) * agent.volatility * 0.4;
  const chaosSwing = (rand() - 0.5) * lobby.parameters.chaosRate * 0.35;

  const intensity = round3(
    clamp(
      agent.intensityBase +
        styleBias +
        strategyBias +
        confidenceBias +
        riskBias +
        volatilitySwing +
        chaosSwing,
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    ),
  );

  const mutationLevel = round3(
    clamp(
      lobby.parameters.mutationSensitivity * 0.55 +
        agent.mutationSensitivity * 0.35 +
        agent.volatility * 0.2 +
        lobby.parameters.chaosRate * 0.35 +
        agent.riskLevel * 0.22 +
        rand() * 0.18,
      0,
      1,
    ),
  );

  const baseBpm = style === "HARD" ? 124 : 106;
  const bpm = round1(
    clamp(
      baseBpm +
        lobby.parameters.bpmBias +
        intensity * 12 +
        mutationLevel * 7 +
        (agent.tempoPressure - 0.5) * 10 +
        (agent.riskLevel - 0.5) * 6 +
        (rand() - 0.5) * 3,
      84,
      148,
    ),
  );

  const patternDensity = round3(
    clamp(
      0.46 +
        intensity * 0.34 +
        mutationLevel * 0.28 +
        (agent.riskLevel - 0.5) * 0.16 +
        lobby.parameters.densityBias +
        (rand() - 0.5) * 0.1,
      0.15,
      1,
    ),
  );

  const distortion = round3(
    clamp(
      (style === "HARD" ? 0.5 : 0.24) +
        intensity * 0.33 +
        mutationLevel * 0.25 +
        (agent.strategy === "AGGRESSIVE" ? 0.08 : 0) +
        (agent.riskLevel - 0.5) * 0.2 +
        lobby.parameters.chaosRate * 0.16 +
        (rand() - 0.5) * 0.08,
      0.05,
      1,
    ),
  );

  const fxChance = round3(
    clamp(
      (style === "SOFT" ? 0.42 : 0.22) +
        lobby.parameters.fxBias +
        mutationLevel * 0.28 +
        Math.abs(agent.riskLevel - 0.5) * 0.08 +
        (rand() - 0.5) * 0.1,
      0.02,
      0.95,
    ),
  );

  return {
    seed,
    style,
    intensity,
    bpm,
    patternDensity,
    distortion,
    mutationLevel,
    fxChance,
  };
}

function tallyWinner(aVotes: number, bVotes: number): VoteWinner {
  if (aVotes > bVotes) {
    return "A";
  }

  if (bVotes > aVotes) {
    return "B";
  }

  return "TIE";
}

function toVoteTally(voteState: ClipVoteState): ClipVoteTally {
  return {
    clipId: voteState.clipId,
    aVotes: voteState.aVotes,
    bVotes: voteState.bVotes,
    winner: tallyWinner(voteState.aVotes, voteState.bVotes),
  };
}

function ensureVoteState(state: StoredLobbyState, clipId: string): ClipVoteState {
  const existing = state.votesByClip[clipId];

  if (existing) {
    return existing;
  }

  const created: ClipVoteState = {
    clipId,
    votes: {},
    aVotes: 0,
    bVotes: 0,
  };

  state.votesByClip[clipId] = created;
  return created;
}

function applyLobbyBiasToAgent(
  lobbyId: LobbyId,
  agent: RuntimeAgent,
  clipIndex: number,
  matchId: string,
): void {
  const lobby = getLobbyConfig(lobbyId);
  const rand = mulberry32(hashSeed(`${matchId}:${clipIndex}:${agent.id}:lobby-bias`));

  if (lobbyId === "chaos-lab") {
    agent.volatility = clamp(agent.volatility + (rand() - 0.5) * 0.12, 0.12, 0.99);
    agent.mutationSensitivity = clamp(agent.mutationSensitivity + (rand() - 0.5) * 0.1, 0.1, 1);
    agent.riskLevel = clamp(agent.riskLevel + (rand() - 0.5) * 0.12, 0.08, 0.99);

    if (rand() < 0.22 + lobby.parameters.chaosRate * 0.15) {
      agent.currentStyle = agent.currentStyle === "HARD" ? "SOFT" : "HARD";
    }
  }

  if (lobbyId === "drift-hard") {
    agent.intensityBase = clamp(
      Math.max(agent.intensityBase, lobby.parameters.intensityRange.min + 0.04),
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    );
    agent.riskLevel = clamp(Math.max(agent.riskLevel, 0.5), 0.08, 0.99);

    if (agent.currentStyle === "SOFT" && rand() < 0.3) {
      agent.currentStyle = "HARD";
    }
  }

  if (lobbyId === "soft-night") {
    agent.intensityBase = clamp(
      Math.min(agent.intensityBase, lobby.parameters.intensityRange.max - 0.04),
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    );
    agent.riskLevel = clamp(Math.min(agent.riskLevel, 0.6), 0.08, 0.99);

    if (agent.currentStyle === "HARD" && rand() < 0.34) {
      agent.currentStyle = "SOFT";
    }
  }
}

function applyOutcomeMutation(
  state: StoredLobbyState,
  agent: RuntimeAgent,
  outcome: VoteWinner,
  clipIndex: number,
): string {
  const lobby = getLobbyConfig(state.lobbyId);
  const rand = mulberry32(hashSeed(`${state.matchId}:${clipIndex}:${agent.id}:vote-mutate`));

  if (outcome === "TIE") {
    agent.confidence = clamp(agent.confidence + 0.005, 0.1, 0.99);
    agent.volatility = clamp(agent.volatility + (rand() - 0.5) * 0.05, 0.08, 0.98);
    agent.riskLevel = clamp(agent.riskLevel + (rand() - 0.5) * 0.03, 0.08, 0.99);
    applyLobbyBiasToAgent(state.lobbyId, agent, clipIndex, state.matchId);
    return "Tie on votes: micro-adjustments only.";
  }

  const agentWon = outcome === agent.id;

  if (agentWon) {
    agent.wins += 1;
    agent.confidence = clamp(agent.confidence + 0.045, 0.1, 0.99);
    agent.riskLevel = clamp(agent.riskLevel + 0.015, 0.08, 0.99);
    agent.intensityBase = clamp(
      agent.intensityBase + 0.015,
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    );
    agent.tempoPressure = clamp(agent.tempoPressure + 0.03, 0.1, 0.99);

    if (agent.strategy === "ADAPTIVE" && rand() < 0.08) {
      agent.currentStyle = agent.currentStyle === "HARD" ? "SOFT" : "HARD";
      applyLobbyBiasToAgent(state.lobbyId, agent, clipIndex, state.matchId);
      return "Vote win: confidence up with exploration style flip.";
    }

    applyLobbyBiasToAgent(state.lobbyId, agent, clipIndex, state.matchId);
    return "Vote win: confidence and pressure increased.";
  }

  agent.losses += 1;
  agent.confidence = clamp(agent.confidence - 0.055, 0.1, 0.98);

  if (agent.strategy === "ADAPTIVE") {
    const switchChance = clamp(
      0.6 + lobby.parameters.mutationSensitivity * 0.2 + agent.mutationSensitivity * 0.2,
      0.4,
      0.95,
    );

    if (rand() < switchChance) {
      agent.currentStyle = agent.currentStyle === "HARD" ? "SOFT" : "HARD";
    }

    agent.riskLevel = clamp(agent.riskLevel + 0.02, 0.08, 0.99);
    agent.tempoPressure = clamp(agent.tempoPressure + 0.04, 0.1, 0.99);
    agent.mutationSensitivity = clamp(agent.mutationSensitivity + 0.04, 0.08, 1);
    applyLobbyBiasToAgent(state.lobbyId, agent, clipIndex, state.matchId);
    return "Adaptive loss: switched style and increased mutation pressure.";
  }

  if (agent.strategy === "AGGRESSIVE") {
    agent.riskLevel = clamp(agent.riskLevel + 0.06, 0.08, 0.99);
    agent.intensityBase = clamp(
      agent.intensityBase + 0.07,
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    );
    agent.mutationSensitivity = clamp(agent.mutationSensitivity + 0.06, 0.08, 1);
    agent.volatility = clamp(agent.volatility + 0.05, 0.08, 0.99);
    agent.tempoPressure = clamp(agent.tempoPressure + 0.08, 0.1, 0.99);
    applyLobbyBiasToAgent(state.lobbyId, agent, clipIndex, state.matchId);
    return "Aggressive loss: raising intensity, tempo, and mutation sensitivity.";
  }

  const rangeMid = (lobby.parameters.intensityRange.min + lobby.parameters.intensityRange.max) / 2;
  agent.riskLevel = clamp(agent.riskLevel - 0.05, 0.08, 0.99);
  agent.volatility = clamp(agent.volatility - 0.08, 0.08, 0.9);
  agent.intensityBase = clamp(
    agent.intensityBase + (rangeMid - agent.intensityBase) * 0.3,
    lobby.parameters.intensityRange.min,
    lobby.parameters.intensityRange.max,
  );
  applyLobbyBiasToAgent(state.lobbyId, agent, clipIndex, state.matchId);
  return "Safe loss: lowered variance and stabilized intensity.";
}

function applyEpochBankrollMutation(
  state: StoredLobbyState,
  agent: RuntimeAgent,
  winner: VoteWinner,
  epochId: number,
): void {
  const lobby = getLobbyConfig(state.lobbyId);
  const rand = mulberry32(hashSeed(`${state.matchId}:${epochId}:epoch:${agent.id}`));

  if (winner === "TIE") {
    agent.confidence = clamp(agent.confidence + 0.005, 0.1, 0.99);
    agent.riskLevel = clamp(agent.riskLevel + (rand() - 0.5) * 0.03, 0.08, 0.99);
    return;
  }

  const won = winner === agent.id;
  if (won) {
    agent.bankroll = round3(agent.bankroll + EPOCH_REWARD_FACTOR);
    agent.winCount += 1;
    agent.confidence = clamp(agent.confidence + 0.03, 0.1, 0.99);
    agent.riskLevel = clamp(agent.riskLevel + 0.03, 0.08, 0.99);
    agent.intensityBase = clamp(
      agent.intensityBase + 0.015,
      lobby.parameters.intensityRange.min,
      lobby.parameters.intensityRange.max,
    );
    return;
  }

  agent.bankroll = round3(Math.max(0, agent.bankroll - EPOCH_PENALTY_FACTOR));
  agent.lossCount += 1;
  agent.confidence = clamp(agent.confidence - 0.03, 0.1, 0.99);

  if (agent.strategy === "AGGRESSIVE") {
    agent.riskLevel = clamp(agent.riskLevel + 0.08, 0.08, 0.99);
    agent.mutationSensitivity = clamp(agent.mutationSensitivity + 0.05, 0.08, 1);
    agent.tempoPressure = clamp(agent.tempoPressure + 0.03, 0.1, 0.99);
    return;
  }

  if (agent.strategy === "SAFE") {
    agent.riskLevel = clamp(agent.riskLevel - 0.07, 0.08, 0.99);
    agent.volatility = clamp(agent.volatility - 0.05, 0.08, 0.9);
    return;
  }

  agent.riskLevel = clamp(agent.riskLevel + 0.02, 0.08, 0.99);
  if (rand() < 0.72) {
    agent.currentStyle = agent.currentStyle === "HARD" ? "SOFT" : "HARD";
  }
}

function finalizeEpochIfNeeded(state: StoredLobbyState, epochId: number, now: number): boolean {
  const aggregate = ensureEpochAggregate(state, epochId);
  if (aggregate.finalizedAt !== null) {
    return false;
  }

  const winner = tallyWinner(aggregate.votesA, aggregate.votesB);
  aggregate.winner = winner;
  aggregate.finalizedAt = now;

  applyEpochBankrollMutation(state, state.agents.A, winner, epochId);
  applyEpochBankrollMutation(state, state.agents.B, winner, epochId);

  state.epochHistory.unshift({
    epochId,
    winner,
    votesA: aggregate.votesA,
    votesB: aggregate.votesB,
    totalBetAWei: aggregate.totalBetAWei,
    totalBetBWei: aggregate.totalBetBWei,
    timestamp: now,
    agentPerformance: {
      A: {
        bankroll: round3(state.agents.A.bankroll),
        wins: state.agents.A.winCount,
        losses: state.agents.A.lossCount,
        riskLevel: round3(state.agents.A.riskLevel),
      },
      B: {
        bankroll: round3(state.agents.B.bankroll),
        wins: state.agents.B.winCount,
        losses: state.agents.B.lossCount,
        riskLevel: round3(state.agents.B.riskLevel),
      },
    },
  });
  state.epochHistory = state.epochHistory.slice(0, EPOCH_HISTORY_LIMIT);
  return true;
}

function syncEpochLifecycle(state: StoredLobbyState, now: number): boolean {
  const currentEpochId = epochIdFromMs(now);
  ensureEpochAggregate(state, currentEpochId);

  if (state.lastEpochId === null) {
    state.lastEpochId = currentEpochId;
    return true;
  }

  if (currentEpochId <= state.lastEpochId) {
    return false;
  }

  for (let epochId = state.lastEpochId; epochId < currentEpochId; epochId += 1) {
    finalizeEpochIfNeeded(state, epochId, now);
  }

  state.lastEpochId = currentEpochId;
  return true;
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
    mutationSensitivity: round3(agent.mutationSensitivity),
    bankroll: round3(agent.bankroll),
    riskLevel: round3(agent.riskLevel),
    winCount: agent.winCount,
    lossCount: agent.lossCount,
    clipsPlayed: agent.clipsPlayed,
    wins: agent.wins,
    losses: agent.losses,
  };
}

function pruneOldVotes(state: StoredLobbyState): void {
  const minClipIndex = Math.max(0, state.loop.processedClipCount - VOTE_RETENTION_CLIPS);

  for (const clipId of Object.keys(state.votesByClip)) {
    const clipIndexRaw = clipId.split("-").pop();
    const clipIndex = clipIndexRaw ? Number(clipIndexRaw) : Number.NaN;

    if (Number.isFinite(clipIndex) && clipIndex < minClipIndex) {
      delete state.votesByClip[clipId];
    }
  }
}

function resumeLoop(state: StoredLobbyState, now: number): boolean {
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

function pauseLoop(state: StoredLobbyState, now: number): boolean {
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

function pruneStaleListeners(state: StoredLobbyState, now: number): boolean {
  let changed = false;

  for (const [sessionId, touchedAt] of Object.entries(state.listeners)) {
    if (now - touchedAt > LISTENER_TTL_MS) {
      delete state.listeners[sessionId];
      changed = true;
    }
  }

  return changed;
}

function applyListenerDrivenLoop(state: StoredLobbyState, now: number): boolean {
  const listeners = Object.keys(state.listeners).length;

  if (listeners > 0) {
    return resumeLoop(state, now);
  }

  return pauseLoop(state, now);
}

function processCompletedClip(state: StoredLobbyState, clipIndex: number): void {
  if (state.loop.runStartedAt === null) {
    return;
  }

  const agentId = activeAgentForClip(clipIndex);
  const agent = state.agents[agentId];
  const plan = computeClipPlan(state, agent, clipIndex);

  const clipId = `${state.matchId}-${clipIndex}`;
  const voteTally = toVoteTally(ensureVoteState(state, clipId));

  const noteForA = applyOutcomeMutation(state, state.agents.A, voteTally.winner, clipIndex);
  const noteForB = applyOutcomeMutation(state, state.agents.B, voteTally.winner, clipIndex);

  state.agents[agentId].clipsPlayed += 1;

  const clipStartElapsed = clipIndex * CLIP_SLOT_MS;
  const startedAt = state.loop.runStartedAt + (clipStartElapsed - state.loop.runStartElapsedMs);
  const resolvedEpochId = epochIdFromMs(startedAt);

  const historyItem: ClipHistoryItem = {
    clipId,
    clipIndex,
    epochId: resolvedEpochId,
    agentId,
    seed: plan.seed,
    startedAt,
    endedAt: startedAt + CLIP_DURATION_MS,
    style: plan.style,
    strategy: agent.strategy,
    confidence: round3(agent.confidence),
    intensity: plan.intensity,
    bpm: plan.bpm,
    patternDensity: plan.patternDensity,
    distortion: plan.distortion,
    mutationLevel: plan.mutationLevel,
    fxChance: plan.fxChance,
    voteTally,
    note: agentId === "A" ? noteForA : noteForB,
  };

  state.clipHistory.unshift(historyItem);
  state.clipHistory = state.clipHistory.slice(0, HISTORY_LIMIT);

  state.loop.processedClipCount += 1;
  pruneOldVotes(state);
}

function syncClipSimulation(state: StoredLobbyState, now: number): boolean {
  if (!state.loop.running) {
    return false;
  }

  const elapsed = getActiveElapsedMs(state, now);
  // A clip is considered completed when its 10s playback ends.
  const completedClipCount = Math.floor((elapsed + CLIP_GAP_MS) / CLIP_SLOT_MS);

  let changed = false;

  while (state.loop.processedClipCount < completedClipCount) {
    processCompletedClip(state, state.loop.processedClipCount);
    changed = true;
  }

  return changed;
}

function buildNowPlaying(state: StoredLobbyState, now: number): NowPlayingClip | null {
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
  const agent = state.agents[agentId];
  const plan = computeClipPlan(state, agent, clipIndex);

  const startedAt = now - clipOffsetInSlot;

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
    bpm: plan.bpm,
    patternDensity: plan.patternDensity,
    distortion: plan.distortion,
    mutationLevel: plan.mutationLevel,
    fxChance: plan.fxChance,
  };
}

function buildViewerBetSnapshot(
  state: StoredLobbyState,
  currentEpochId: number,
  viewerAddress?: string,
): ViewerBetSnapshot | null {
  const normalized = normalizeAddress(viewerAddress);
  if (!normalized) {
    return null;
  }

  const bet = state.userBetsByEpoch[epochKey(currentEpochId)]?.[normalized];
  const amountAWei = bet?.amountAWei ?? "0";
  const amountBWei = bet?.amountBWei ?? "0";
  const totalWei = addWei(amountAWei, amountBWei);

  return {
    epochId: currentEpochId,
    amountAWei,
    amountBWei,
    totalWei,
    hasBet: totalWei !== "0",
  };
}

function buildClaimableEpochIds(
  state: StoredLobbyState,
  currentEpochId: number,
  viewerAddress?: string,
): number[] {
  const normalized = normalizeAddress(viewerAddress);
  if (!normalized) {
    return [];
  }

  const claimable: number[] = [];
  for (const [epochRaw, byAddress] of Object.entries(state.userBetsByEpoch)) {
    const epochId = Number(epochRaw);
    if (!Number.isFinite(epochId) || epochId >= currentEpochId) {
      continue;
    }

    const bet = byAddress[normalized];
    if (!bet || bet.claimed || addWei(bet.amountAWei, bet.amountBWei) === "0") {
      continue;
    }

    const aggregate = ensureEpochAggregate(state, epochId);
    if (aggregate.finalizedAt === null) {
      continue;
    }

    const hasWinningBet =
      (aggregate.winner === "A" && BigInt(safeWei(bet.amountAWei)) > 0n) ||
      (aggregate.winner === "B" && BigInt(safeWei(bet.amountBWei)) > 0n);

    if (hasWinningBet) {
      claimable.push(epochId);
    }
  }

  claimable.sort((a, b) => b - a);
  return claimable;
}

function buildSnapshot(state: StoredLobbyState, now: number, viewerAddress?: string): MatchSnapshot {
  const listeners = Object.keys(state.listeners).length;
  const nowPlaying = buildNowPlaying(state, now);
  const currentVoteTally = nowPlaying ? toVoteTally(ensureVoteState(state, nowPlaying.clipId)) : null;
  const currentEpochId = epochIdFromMs(now);
  const currentEpoch = ensureEpochAggregate(state, currentEpochId);
  const viewerBet = buildViewerBetSnapshot(state, currentEpochId, viewerAddress);
  const claimableEpochIds = buildClaimableEpochIds(state, currentEpochId, viewerAddress);

  return {
    lobbyId: state.lobbyId,
    lobby: getLobbyConfig(state.lobbyId),
    matchId: state.matchId,
    status: listeners > 0 ? "LIVE" : "IDLE",
    phase: nowPlaying ? (nowPlaying.agentId === "A" ? "A_PLAYING" : "B_PLAYING") : "IDLE",
    listeners,
    clipDurationMs: CLIP_DURATION_MS,
    totalClipsPlayed: state.loop.processedClipCount,
    currentClipIndex: nowPlaying?.clipIndex ?? state.loop.processedClipCount,
    loopStartedAt: state.loop.startedAt,
    nowPlaying,
    currentVoteTally,
    clipHistory: [...state.clipHistory],
    currentEpoch: {
      epochId: currentEpochId,
      startedAt: epochStartMs(currentEpochId),
      endsAt: epochEndMs(currentEpochId),
      isOpen: now < epochEndMs(currentEpochId),
      isFinalized: currentEpoch.finalizedAt !== null,
      winner: currentEpoch.winner,
      votesA: currentEpoch.votesA,
      votesB: currentEpoch.votesB,
      totalBetAWei: currentEpoch.totalBetAWei,
      totalBetBWei: currentEpoch.totalBetBWei,
    },
    epochHistory: [...state.epochHistory],
    viewerBet,
    claimableEpochIds,
    agents: [toAgentState(state.agents.A), toAgentState(state.agents.B)],
    lastUpdatedAt: now,
  };
}

async function syncAndSnapshot(
  state: StoredLobbyState,
  now: number,
  viewerAddress?: string,
): Promise<MatchSnapshot> {
  const staleChanged = pruneStaleListeners(state, now);
  const simChanged = syncClipSimulation(state, now);
  const loopChanged = applyListenerDrivenLoop(state, now);
  const epochChanged = syncEpochLifecycle(state, now);

  const snapshot = buildSnapshot(state, now, viewerAddress);

  if (staleChanged || simChanged || loopChanged || epochChanged) {
    await writeLobbyState(state);
  }

  return snapshot;
}

export function getLobbyIds(): LobbyId[] {
  return [...LOBBY_IDS];
}

export async function getAllMatchSnapshots(now = Date.now()): Promise<MatchSnapshot[]> {
  return Promise.all(LOBBY_IDS.map((lobbyId) => getMatchSnapshot(lobbyId, now)));
}

export async function getMatchSnapshot(
  lobbyIdInput?: string,
  now = Date.now(),
  viewerAddress?: string,
): Promise<MatchSnapshot> {
  const lobbyId = resolveLobbyIdOrThrow(lobbyIdInput);
  const state = await loadLobbyState(lobbyId);
  return syncAndSnapshot(state, now, viewerAddress);
}

export async function joinPresence(
  lobbyIdInput: string | undefined,
  sessionIdRaw?: string,
): Promise<{ sessionId: string; snapshot: MatchSnapshot }> {
  const lobbyId = resolveLobbyIdOrThrow(lobbyIdInput);
  const state = await loadLobbyState(lobbyId);
  const now = Date.now();
  const sessionId =
    parseSessionId(sessionIdRaw) ??
    `session_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;

  state.listeners[sessionId] = now;

  const snapshot = await syncAndSnapshot(state, now);

  return {
    sessionId,
    snapshot,
  };
}

export async function leavePresence(
  lobbyIdInput: string | undefined,
  sessionIdRaw?: string,
): Promise<MatchSnapshot> {
  const lobbyId = resolveLobbyIdOrThrow(lobbyIdInput);
  const state = await loadLobbyState(lobbyId);
  const now = Date.now();

  const sessionId = parseSessionId(sessionIdRaw);
  if (sessionId) {
    delete state.listeners[sessionId];
  }

  return syncAndSnapshot(state, now);
}

export async function castVote(input: {
  lobbyId: string;
  clipId: string;
  side: VoteSide;
  address: string;
}): Promise<VoteResult> {
  const lobbyId = resolveLobbyIdOrThrow(input.lobbyId);

  if (input.side !== "A" && input.side !== "B") {
    throw new Error("Invalid vote side.");
  }

  const normalizedAddress = normalizeAddress(input.address);
  if (!normalizedAddress) {
    throw new Error("Invalid wallet address.");
  }

  const state = await loadLobbyState(lobbyId);
  const now = Date.now();

  await syncAndSnapshot(state, now);

  const nowPlaying = buildNowPlaying(state, now);
  if (!nowPlaying) {
    throw new Error("Lobby is idle. Voting unavailable.");
  }

  if (nowPlaying.clipId !== input.clipId) {
    throw new Error("Voting is only allowed for the current clip.");
  }

  const voteState = ensureVoteState(state, input.clipId);

  if (voteState.votes[normalizedAddress]) {
    throw new Error("Address has already voted for this clip.");
  }

  voteState.votes[normalizedAddress] = input.side;

  if (input.side === "A") {
    voteState.aVotes += 1;
  } else {
    voteState.bVotes += 1;
  }

  const aggregate = ensureEpochAggregate(state, epochIdFromMs(now));
  if (input.side === "A") {
    aggregate.votesA += 1;
  } else {
    aggregate.votesB += 1;
  }

  await writeLobbyState(state);

  return {
    lobbyId,
    clipId: input.clipId,
    aVotes: voteState.aVotes,
    bVotes: voteState.bVotes,
    winner: tallyWinner(voteState.aVotes, voteState.bVotes),
    userVote: input.side,
  };
}

export async function registerBet(input: {
  lobbyId: string;
  epochId: number;
  side: VoteSide;
  amountWei: string;
  address: string;
}): Promise<BetResult> {
  const lobbyId = resolveLobbyIdOrThrow(input.lobbyId);
  const normalizedAddress = normalizeAddress(input.address);

  if (!normalizedAddress) {
    throw new Error("Invalid wallet address.");
  }

  if (input.side !== "A" && input.side !== "B") {
    throw new Error("Invalid bet side.");
  }

  if (!isWeiLike(input.amountWei) || BigInt(input.amountWei) <= 0n) {
    throw new Error("Invalid bet amount.");
  }

  const state = await loadLobbyState(lobbyId);
  const now = Date.now();
  await syncAndSnapshot(state, now);

  const currentEpochId = epochIdFromMs(now);
  if (currentEpochId !== input.epochId) {
    throw new Error("Bet epoch mismatch. Refresh and retry.");
  }

  const aggregate = ensureEpochAggregate(state, currentEpochId);
  if (input.side === "A") {
    aggregate.totalBetAWei = addWei(aggregate.totalBetAWei, input.amountWei);
  } else {
    aggregate.totalBetBWei = addWei(aggregate.totalBetBWei, input.amountWei);
  }

  const key = epochKey(currentEpochId);
  if (!state.userBetsByEpoch[key]) {
    state.userBetsByEpoch[key] = {};
  }

  const existing = state.userBetsByEpoch[key][normalizedAddress] ?? {
    amountAWei: "0",
    amountBWei: "0",
    claimed: false,
  };

  if (input.side === "A") {
    existing.amountAWei = addWei(existing.amountAWei, input.amountWei);
  } else {
    existing.amountBWei = addWei(existing.amountBWei, input.amountWei);
  }
  existing.claimed = false;

  state.userBetsByEpoch[key][normalizedAddress] = existing;
  await writeLobbyState(state);

  return {
    lobbyId,
    epochId: currentEpochId,
    totalBetAWei: aggregate.totalBetAWei,
    totalBetBWei: aggregate.totalBetBWei,
    userAmountAWei: existing.amountAWei,
    userAmountBWei: existing.amountBWei,
  };
}

export async function markClaimed(input: {
  lobbyId: string;
  epochId: number;
  address: string;
}): Promise<void> {
  const lobbyId = resolveLobbyIdOrThrow(input.lobbyId);
  const normalizedAddress = normalizeAddress(input.address);
  if (!normalizedAddress) {
    throw new Error("Invalid wallet address.");
  }

  const state = await loadLobbyState(lobbyId);
  const key = epochKey(input.epochId);
  if (!state.userBetsByEpoch[key] || !state.userBetsByEpoch[key][normalizedAddress]) {
    return;
  }

  const aggregate = ensureEpochAggregate(state, input.epochId);
  if (aggregate.finalizedAt === null || aggregate.winner === null || aggregate.winner === "TIE") {
    return;
  }

  const bet = state.userBetsByEpoch[key][normalizedAddress];
  const hasWinningAmount =
    (aggregate.winner === "A" && BigInt(safeWei(bet.amountAWei)) > 0n) ||
    (aggregate.winner === "B" && BigInt(safeWei(bet.amountBWei)) > 0n);

  if (!hasWinningAmount) {
    return;
  }

  state.userBetsByEpoch[key][normalizedAddress].claimed = true;
  await writeLobbyState(state);
}

async function resetLobbyState(lobbyId: LobbyId, clearListeners: boolean): Promise<MatchSnapshot> {
  const state = await loadLobbyState(lobbyId);
  const now = Date.now();
  const currentEpochId = epochIdFromMs(now);

  if (clearListeners) {
    state.listeners = {};
  }

  state.agents = makeInitialAgents(lobbyId);
  state.clipHistory = [];
  state.votesByClip = {};
  state.loop = defaultLoopState();
  state.epochAggregates = {
    [epochKey(currentEpochId)]: emptyEpochAggregate(currentEpochId),
  };
  state.userBetsByEpoch = {};
  state.epochHistory = [];
  state.lastEpochId = currentEpochId;

  await writeLobbyState(state);

  return buildSnapshot(state, now);
}

export async function startMatch(lobbyIdInput?: string): Promise<MatchSnapshot[] | MatchSnapshot> {
  if (!lobbyIdInput) {
    return Promise.all(LOBBY_IDS.map((lobbyId) => resetLobbyState(lobbyId, false)));
  }

  const lobbyId = resolveLobbyIdOrThrow(lobbyIdInput);
  return resetLobbyState(lobbyId, false);
}

export async function resetMatch(lobbyIdInput?: string): Promise<MatchSnapshot[] | MatchSnapshot> {
  if (!lobbyIdInput) {
    return Promise.all(LOBBY_IDS.map((lobbyId) => resetLobbyState(lobbyId, true)));
  }

  const lobbyId = resolveLobbyIdOrThrow(lobbyIdInput);
  return resetLobbyState(lobbyId, true);
}
