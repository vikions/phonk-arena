export type MatchStatus = "LIVE" | "IDLE";

export type MatchPhase = "A_PLAYING" | "B_PLAYING" | "IDLE";

export type AgentId = "A" | "B";

export type AgentStyle = "HARD" | "SOFT";

export type AgentStrategy = "AGGRESSIVE" | "ADAPTIVE" | "SAFE";

export type ClipOutcome = "WIN" | "LOSS" | "TIE" | "OPENING";

export interface AgentState {
  id: AgentId;
  personaName: string;
  baseStyle: AgentStyle;
  currentStyle: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensity: number;
  clipsPlayed: number;
  wins: number;
  losses: number;
  lastJudgeScore: number | null;
}

export interface NowPlayingClip {
  clipId: string;
  clipIndex: number;
  agentId: AgentId;
  seed: string;
  startedAt: number;
  endsAt: number;
  durationMs: number;
  style: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensity: number;
}

export interface ClipHistoryItem {
  clipId: string;
  clipIndex: number;
  agentId: AgentId;
  seed: string;
  startedAt: number;
  endedAt: number;
  style: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensity: number;
  judgeScore: number;
  outcome: ClipOutcome;
  note: string;
}

export interface MatchSnapshot {
  lobbyId: string;
  matchId: string;
  status: MatchStatus;
  phase: MatchPhase;
  listeners: number;
  clipDurationMs: number;
  totalClipsPlayed: number;
  currentClipIndex: number;
  loopStartedAt: number | null;
  nowPlaying: NowPlayingClip | null;
  clipHistory: ClipHistoryItem[];
  agents: AgentState[];
  lastUpdatedAt: number;
}