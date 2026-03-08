export type AgentId = 0 | 1 | 2 | 3;

export interface InkToken {
  address: string;
  symbol: string;
  name: string;
  priceChange24h: number;
  volume24h: number;
  holderCount: number;
  circulatingMarketCap: number;
}

export interface DiscoveredInkToken extends InkToken {
  priceUsd: number;
  holderDelta24h: number | null;
  liquidityUsd: number;
  txCount24h: number;
  socialCount: number;
  createdAt: string | null;
  hypeScore: number;
  strategyScore: number;
  pairAddress: string | null;
  pairUrl: string | null;
  source: "inkypump+dexscreener";
}

export interface AgentTokenPick {
  agentId: AgentId;
  strategy: "RAGE" | "GHOST" | "ORACLE" | "GLITCH";
  token: DiscoveredInkToken;
}

export interface DailyAgentPicksResponse {
  generatedAt: string;
  dailySeed: number;
  picks: AgentTokenPick[];
}
