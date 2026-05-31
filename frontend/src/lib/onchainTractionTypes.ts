export interface RecentOnchainBet {
  txHash: string;
  walletAddress: string;
  epochId: string;
  agentId: number;
  amountEth: string;
  blockNumber: string;
  createdAt: string | null;
}

export interface OnchainTractionSummary {
  enabled: boolean;
  source: "onchain";
  generatedAt: string;
  networkLabel: string;
  explorerUrl: string;
  contractAddress: string;
  currentEpochId: string | null;
  currentEpochOpen: boolean | null;
  currentEpochPoolEth: string;
  currentEpochBettors: number;
  bets24h: number;
  activeBettors24h: number;
  volume24hEth: string;
  bets7d: number;
  activeBettors7d: number;
  repeatBettors7d: number;
  volume7dEth: string;
  latestBlock: string | null;
  scannedFromBlock: string | null;
  recentBets: RecentOnchainBet[];
  error?: string;
}
