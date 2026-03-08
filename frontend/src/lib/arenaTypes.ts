import type { DiscoveredInkToken } from "@/lib/tokenDiscovery";
import type { AgentId, AgentStrategy, AgentStyle, LobbyId } from "@/lib/types";

export type ArenaAgentId = 0 | 1 | 2 | 3;
export type ArenaAgentName = "RAGE" | "GHOST" | "ORACLE" | "GLITCH";
export type ArenaBattleStatus = "LIVE" | "IDLE";

export interface ArenaAgentDnaSnapshot {
  mutationVersion: number;
  bpmRange: number;
  layerDensity: number;
  glitchIntensity: number;
  bassWeight: number;
  wins: number;
  losses: number;
}

export interface ArenaScoreBreakdown {
  priceLead: number;
  volumeStrength: number;
  flowStrength: number;
  liquiditySupport: number;
  holderFlow: number;
  total: number;
}

export interface ArenaBattleAgentSnapshot {
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
  clipsPlayed: number;
  mutationDrift: number;
}

export interface ArenaNowPlayingClip {
  clipId: string;
  clipIndex: number;
  agentId: ArenaAgentId;
  agentPersona: ArenaAgentName;
  seed: string;
  startedAt: number;
  endsAt: number;
  durationMs: number;
  style: AgentStyle;
  strategy: AgentStrategy;
  renderLobbyId: LobbyId;
  renderAgentId: AgentId;
  intensity: number;
  bpm: number;
  patternDensity: number;
  distortion: number;
  mutationLevel: number;
  fxChance: number;
}

export interface ArenaClipHistoryItem {
  clipId: string;
  clipIndex: number;
  agentId: ArenaAgentId;
  agentPersona: ArenaAgentName;
  tokenSymbol: string;
  startedAt: number;
  endedAt: number;
  style: AgentStyle;
  strategy: AgentStrategy;
  intensity: number;
  bpm: number;
  patternDensity: number;
  distortion: number;
  mutationLevel: number;
  fxChance: number;
  liveScore: number;
  note: string;
}

export interface ArenaEpochSnapshot {
  epochId: number;
  startedAt: number;
  endsAt: number;
  scoringRule: string;
  leaderAgentId: ArenaAgentId | null;
  projectedWinnerAgentId: ArenaAgentId | null;
}

export interface ArenaBattleSnapshot {
  arenaId: "ink-phonk-arena";
  status: ArenaBattleStatus;
  listeners: number;
  clipDurationMs: number;
  clipGapMs: number;
  totalClipsPlayed: number;
  currentClipIndex: number;
  loopStartedAt: number | null;
  nowPlaying: ArenaNowPlayingClip | null;
  agents: ArenaBattleAgentSnapshot[];
  leaderboard: ArenaAgentId[];
  clipHistory: ArenaClipHistoryItem[];
  currentEpoch: ArenaEpochSnapshot;
  bettingMode: "awaiting_arena_abi" | "arena_sidecar_live";
  lastUpdatedAt: number;
}
