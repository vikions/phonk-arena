export type MatchStatus = "LIVE" | "IDLE";

export type MatchPhase = "A_PLAYING" | "B_PLAYING" | "IDLE";

export type AgentId = "A" | "B";

export type VoteSide = AgentId;

export type VoteWinner = VoteSide | "TIE";

export type AgentStyle = "HARD" | "SOFT";

export type AgentStrategy = "AGGRESSIVE" | "ADAPTIVE" | "SAFE";

export type LobbyId = "drift-hard" | "soft-night" | "chaos-lab";

export type LobbyTag = "HARD" | "SOFT" | "CHAOS";

export interface LobbyAgentConfig {
  personaName: string;
  baseStyle: AgentStyle;
  strategy: AgentStrategy;
}

export interface LobbyParameters {
  mutationSensitivity: number;
  intensityRange: {
    min: number;
    max: number;
  };
  bpmBias: number;
  chaosRate: number;
  styleBias: number;
  densityBias: number;
  fxBias: number;
}

export interface LobbyConfig {
  lobbyId: LobbyId;
  displayName: string;
  description: string;
  tag: LobbyTag;
  agentA: LobbyAgentConfig;
  agentB: LobbyAgentConfig;
  parameters: LobbyParameters;
}

export interface ClipVoteTally {
  clipId: string;
  aVotes: number;
  bVotes: number;
  winner: VoteWinner;
}

export interface AgentState {
  id: AgentId;
  personaName: string;
  baseStyle: AgentStyle;
  currentStyle: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensity: number;
  mutationSensitivity: number;
  bankroll: number;
  riskLevel: number;
  winCount: number;
  lossCount: number;
  clipsPlayed: number;
  wins: number;
  losses: number;
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
  bpm: number;
  patternDensity: number;
  distortion: number;
  mutationLevel: number;
  fxChance: number;
}

export interface ClipHistoryItem {
  clipId: string;
  clipIndex: number;
  epochId: number;
  agentId: AgentId;
  seed: string;
  startedAt: number;
  endedAt: number;
  style: AgentStyle;
  strategy: AgentStrategy;
  confidence: number;
  intensity: number;
  bpm: number;
  patternDensity: number;
  distortion: number;
  mutationLevel: number;
  fxChance: number;
  voteTally: ClipVoteTally;
  note: string;
}

export interface CurrentEpochSnapshot {
  epochId: number;
  startedAt: number;
  endsAt: number;
  isOpen: boolean;
  isFinalized: boolean;
  winner: VoteWinner | null;
  votesA: number;
  votesB: number;
  totalBetAWei: string;
  totalBetBWei: string;
}

export interface EpochHistoryEntry {
  epochId: number;
  winner: VoteWinner;
  votesA: number;
  votesB: number;
  totalBetAWei: string;
  totalBetBWei: string;
  timestamp: number;
  agentPerformance: {
    A: {
      bankroll: number;
      wins: number;
      losses: number;
      riskLevel: number;
    };
    B: {
      bankroll: number;
      wins: number;
      losses: number;
      riskLevel: number;
    };
  };
}

export interface ViewerBetSnapshot {
  epochId: number;
  amountAWei: string;
  amountBWei: string;
  totalWei: string;
  hasBet: boolean;
}

export interface MatchSnapshot {
  lobbyId: LobbyId;
  lobby: LobbyConfig;
  matchId: string;
  status: MatchStatus;
  phase: MatchPhase;
  listeners: number;
  clipDurationMs: number;
  totalClipsPlayed: number;
  currentClipIndex: number;
  loopStartedAt: number | null;
  nowPlaying: NowPlayingClip | null;
  currentVoteTally: ClipVoteTally | null;
  clipHistory: ClipHistoryItem[];
  currentEpoch: CurrentEpochSnapshot;
  epochHistory: EpochHistoryEntry[];
  viewerBet: ViewerBetSnapshot | null;
  claimableEpochIds: number[];
  agents: AgentState[];
  lastUpdatedAt: number;
}

export interface VotePayload {
  lobbyId: LobbyId;
  clipId: string;
  side: VoteSide;
  address: string;
}

export interface VoteResult {
  lobbyId: LobbyId;
  clipId: string;
  aVotes: number;
  bVotes: number;
  winner: VoteWinner;
  userVote: VoteSide;
}

export interface BetPayload {
  lobbyId: LobbyId;
  side: VoteSide;
  amountWei: string;
  epochId: number;
  address: string;
}

export interface BetResult {
  lobbyId: LobbyId;
  epochId: number;
  totalBetAWei: string;
  totalBetBWei: string;
  userAmountAWei: string;
  userAmountBWei: string;
}
