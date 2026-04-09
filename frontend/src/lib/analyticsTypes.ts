export type AnalyticsEventName =
  | "landing_view"
  | "foyer_view"
  | "battle_view"
  | "wallet_connected"
  | "bet_submitted"
  | "bet_confirmed"
  | "claim_submitted"
  | "claim_confirmed";

export interface AnalyticsTrackPayload {
  eventName: AnalyticsEventName;
  eventKey?: string;
  sessionId?: string;
  path?: string;
  walletAddress?: string;
  txHash?: string;
  lobbyId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface RecentTransactionActivity {
  eventName: "bet_confirmed" | "claim_confirmed";
  txHash: string;
  walletAddress: string | null;
  lobbyId: string | null;
  createdAt: string;
}

export interface TractionSummary {
  enabled: boolean;
  backend: "postgres" | "file";
  generatedAt: string;
  liveListeners: number;
  pageViews24h: number;
  uniqueSessions24h: number;
  battleSessions24h: number;
  uniqueWallets24h: number;
  submittedTransactions24h: number;
  confirmedTransactions24h: number;
  repeatSessions7d: number;
  recentTransactions: RecentTransactionActivity[];
}
