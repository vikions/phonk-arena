import "server-only";

import type { AgentId, AgentTokenPick, DiscoveredInkToken, InkToken } from "@/lib/tokenDiscovery";
import { updateHolderSnapshots } from "@/lib/server/tokenSnapshotStore";

interface InkyPumpToken {
  address?: string;
  ticker?: string;
  name?: string;
  market_cap?: number | string;
  volume_24h?: number | string;
  price_change_24h?: number | string;
  total_holders?: number | string;
  txns_24h_buys?: number | string;
  txns_24h_sells?: number | string;
  created_at?: string;
  website?: string | null;
  telegram?: string | null;
  twitter?: string | null;
}

interface InkyPumpListResponse {
  tokens?: InkyPumpToken[];
  items?: InkyPumpToken[];
  data?: InkyPumpToken[];
}

interface DexTokenRef {
  address?: string;
  symbol?: string;
  name?: string;
}

interface DexPair {
  pairAddress?: string;
  url?: string;
  pairCreatedAt?: number;
  baseToken?: DexTokenRef;
  quoteToken?: DexTokenRef;
  liquidity?: {
    usd?: number;
  };
  txns?: {
    h24?: {
      buys?: number;
      sells?: number;
    };
  };
  volume?: {
    h24?: number;
  };
  priceChange?: {
    h24?: number;
  };
  marketCap?: number;
  fdv?: number;
}

interface RankedInkyToken extends InkToken {
  txCount24h: number;
  socialCount: number;
  createdAt: string | null;
  trendingRank: number | null;
  newestRank: number | null;
}

interface CandidateToken extends DiscoveredInkToken {
  ghostScore: number;
  oracleScore: number;
  rageScore: number;
  recencyScore: number;
  trendingScore: number;
}

type TokenPickMap = Record<AgentId, AgentTokenPick>;

const INKYPUMP_API_BASE_URL = "https://inkypump.com/api";
const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
const DEXSCREENER_CHAIN_ID = "ink";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_BATCH_SIZE = 30;

const BLACKLIST_SYMBOLS = [
  "USDT",
  "USDC",
  "USDC.E",
  "DAI",
  "WETH",
  "WBTC",
  "ETH",
  "STETH",
  "RETH",
  "FRAX",
  "BUSD",
  "TUSD",
  "USDP",
  "GUSD",
];

const BLACKLIST_NAME_SNIPPETS = [
  "usd coin",
  "tether",
  "wrapped",
  "bridged usdc",
  "bridged usdt",
  "staked ether",
  "rocket pool ether",
];

const DISCOVERY_FILTER_TIERS = [
  { minLiquidityUsd: 2_500, minTxCount24h: 30, minHolders: 20, requireSocials: true },
  { minLiquidityUsd: 750, minTxCount24h: 12, minHolders: 10, requireSocials: true },
  { minLiquidityUsd: 150, minTxCount24h: 5, minHolders: 3, requireSocials: false },
] as const;

const STRATEGY_NAMES: Record<AgentId, AgentTokenPick["strategy"]> = {
  0: "RAGE",
  1: "GHOST",
  2: "ORACLE",
  3: "GLITCH",
};

let cachedDailyPickState:
  | {
      dailySeed: number;
      promise: Promise<TokenPickMap>;
    }
  | null = null;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function chunkArray<T>(items: T[], size: number): T[][];
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getDailySeed(nowMs = Date.now()): number {
  return Math.floor(nowMs / 86_400_000);
}

function getRandomHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeAddress(address: string | undefined): string {
  return (address || "").trim().toLowerCase();
}

function countSocials(token: InkyPumpToken): number {
  return [token.website, token.telegram, token.twitter].filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  ).length;
}

function parseCreatedAt(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeInkyToken(token: InkyPumpToken, sourceRank: { trendingRank: number | null; newestRank: number | null }): RankedInkyToken | null {
  const address = normalizeAddress(token.address);
  const symbol = (token.ticker || "").trim().toUpperCase();
  const name = (token.name || "").trim();

  if (!address || address === ZERO_ADDRESS || !symbol || !name) {
    return null;
  }

  return {
    address,
    symbol,
    name,
    priceChange24h: toNumber(token.price_change_24h),
    volume24h: toNumber(token.volume_24h),
    holderCount: toNumber(token.total_holders),
    circulatingMarketCap: toNumber(token.market_cap),
    txCount24h: toNumber(token.txns_24h_buys) + toNumber(token.txns_24h_sells),
    socialCount: countSocials(token),
    createdAt: parseCreatedAt(token.created_at),
    trendingRank: sourceRank.trendingRank,
    newestRank: sourceRank.newestRank,
  };
}

async function fetchInkyPumpPages(): Promise<RankedInkyToken[]> {
  const newestCreatedFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const requests: Array<Promise<InkyPumpListResponse | null>> = [];

  for (let page = 1; page <= 3; page += 1) {
    requests.push(
      fetchJson<InkyPumpListResponse>(
        `${INKYPUMP_API_BASE_URL}/tokens?page=${page}&sortBy=trending&status=live&timeframe=24h`,
      ),
    );
  }

  for (let page = 1; page <= 2; page += 1) {
    requests.push(
      fetchJson<InkyPumpListResponse>(
        `${INKYPUMP_API_BASE_URL}/tokens?page=${page}&sortBy=newest&status=live&createdFrom=${encodeURIComponent(newestCreatedFrom)}`,
      ),
    );
  }

  const responses = await Promise.all(requests);
  const merged = new Map<string, RankedInkyToken>();

  responses.forEach((response, responseIndex) => {
    const items = Array.isArray(response)
      ? response
      : Array.isArray(response?.tokens)
        ? response.tokens
      : Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.data)
          ? response.data
          : [];
    const isTrending = responseIndex < 3;

    items.forEach((item, itemIndex) => {
      const normalized = normalizeInkyToken(item, {
        trendingRank: isTrending ? itemIndex + 1 + responseIndex * 100 : null,
        newestRank: isTrending ? null : itemIndex + 1 + (responseIndex - 3) * 100,
      });

      if (!normalized) {
        return;
      }

      const existing = merged.get(normalized.address);
      if (!existing) {
        merged.set(normalized.address, normalized);
        return;
      }

      merged.set(normalized.address, {
        ...existing,
        ...normalized,
        trendingRank:
          existing.trendingRank === null
            ? normalized.trendingRank
            : normalized.trendingRank === null
              ? existing.trendingRank
              : Math.min(existing.trendingRank, normalized.trendingRank),
        newestRank:
          existing.newestRank === null
            ? normalized.newestRank
            : normalized.newestRank === null
              ? existing.newestRank
              : Math.min(existing.newestRank, normalized.newestRank),
      });
    });
  });

  return [...merged.values()];
}

function pickBestPair(tokenAddress: string, pairs: DexPair[]): DexPair | null {
  const normalizedAddress = tokenAddress.toLowerCase();
  let bestPair: DexPair | null = null;
  let bestLiquidity = -1;

  for (const pair of pairs) {
    const baseAddress = normalizeAddress(pair.baseToken?.address);
    const quoteAddress = normalizeAddress(pair.quoteToken?.address);
    if (baseAddress !== normalizedAddress && quoteAddress !== normalizedAddress) {
      continue;
    }

    const liquidityUsd = toNumber(pair.liquidity?.usd);
    if (liquidityUsd > bestLiquidity) {
      bestLiquidity = liquidityUsd;
      bestPair = pair;
    }
  }

  return bestPair;
}

async function fetchDexPairsByToken(tokens: RankedInkyToken[]): Promise<Map<string, DexPair | null>> {
  const pairByAddress = new Map<string, DexPair | null>();
  const addresses = tokens.map((token) => token.address);

  for (const batch of chunkArray(addresses, DEFAULT_BATCH_SIZE)) {
    const response = await fetchJson<DexPair[]>(
      `${DEXSCREENER_API_BASE_URL}/tokens/v1/${DEXSCREENER_CHAIN_ID}/${batch.join(",")}`,
    );

    const pairs = Array.isArray(response) ? response : [];
    const groupedPairs = new Map<string, DexPair[]>();

    for (const pair of pairs) {
      const baseAddress = normalizeAddress(pair.baseToken?.address);
      const quoteAddress = normalizeAddress(pair.quoteToken?.address);

      if (baseAddress) {
        groupedPairs.set(baseAddress, [...(groupedPairs.get(baseAddress) || []), pair]);
      }

      if (quoteAddress && quoteAddress !== baseAddress) {
        groupedPairs.set(quoteAddress, [...(groupedPairs.get(quoteAddress) || []), pair]);
      }
    }

    for (const address of batch) {
      pairByAddress.set(address, pickBestPair(address, groupedPairs.get(address) || []));
    }
  }

  return pairByAddress;
}

function getTrendingScore(token: RankedInkyToken): number {
  if (token.trendingRank === null) {
    return 0;
  }

  return 1 / (1 + token.trendingRank / 10);
}

function getRecencyScore(createdAt: string | null, nowMs: number): number {
  if (!createdAt) {
    return 0;
  }

  const ageMs = nowMs - new Date(createdAt).getTime();
  if (ageMs <= 0) {
    return 1;
  }

  const ageHours = ageMs / (60 * 60 * 1000);
  return 1 / (1 + ageHours / 24);
}

function isBlacklistedToken(token: RankedInkyToken): boolean {
  if (BLACKLIST_SYMBOLS.includes(token.symbol)) {
    return true;
  }

  const lowerName = token.name.toLowerCase();
  return BLACKLIST_NAME_SNIPPETS.some((snippet) => lowerName.includes(snippet));
}

function normalizeRatio(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(maxValue) || maxValue <= 0) {
    return 0;
  }

  return Math.min(value / maxValue, 1);
}

function buildCandidates(
  rawTokens: RankedInkyToken[],
  pairByAddress: Map<string, DexPair | null>,
  holderDeltaByAddress: Record<string, number | null>,
  nowMs: number,
): CandidateToken[] {
  const baseCandidates = rawTokens
    .filter((token) => !isBlacklistedToken(token))
    .map((token) => {
      const pair = pairByAddress.get(token.address) || null;
      const liquidityUsd = toNumber(pair?.liquidity?.usd);
      const dexTxCount = toNumber(pair?.txns?.h24?.buys) + toNumber(pair?.txns?.h24?.sells);
      const dexVolume24h = toNumber(pair?.volume?.h24);
      const dexPriceChange24h = toNumber(pair?.priceChange?.h24);
      const marketCap = toNumber(pair?.marketCap) || toNumber(pair?.fdv) || token.circulatingMarketCap;

      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        priceChange24h: dexPriceChange24h || token.priceChange24h,
        volume24h: dexVolume24h || token.volume24h,
        holderCount: token.holderCount,
        circulatingMarketCap: marketCap,
        holderDelta24h: holderDeltaByAddress[token.address] ?? null,
        liquidityUsd,
        txCount24h: dexTxCount || token.txCount24h,
        socialCount: token.socialCount,
        createdAt: token.createdAt,
        pairAddress: pair?.pairAddress || null,
        pairUrl: pair?.url || null,
        source: "inkypump+dexscreener" as const,
        hypeScore: 0,
        strategyScore: 0,
        ghostScore: 0,
        oracleScore: 0,
        rageScore: 0,
        recencyScore: getRecencyScore(token.createdAt, nowMs),
        trendingScore: getTrendingScore(token),
      };
    });

  for (const tier of DISCOVERY_FILTER_TIERS) {
    const filtered = baseCandidates.filter((token) => {
      if (token.holderCount < tier.minHolders) {
        return false;
      }
      if (token.txCount24h < tier.minTxCount24h) {
        return false;
      }
      if (token.liquidityUsd < tier.minLiquidityUsd) {
        return false;
      }
      if (tier.requireSocials && token.socialCount === 0) {
        return false;
      }
      return true;
    });

    if (filtered.length >= 4) {
      return scoreCandidates(filtered);
    }
  }

  return scoreCandidates(baseCandidates);
}

function scoreCandidates(candidates: CandidateToken[]): CandidateToken[] {
  const maxAbsChange = Math.max(...candidates.map((candidate) => Math.abs(candidate.priceChange24h)), 0);
  const maxVolume = Math.max(...candidates.map((candidate) => candidate.volume24h), 0);
  const maxLiquidity = Math.max(...candidates.map((candidate) => candidate.liquidityUsd), 0);
  const maxTxCount = Math.max(...candidates.map((candidate) => candidate.txCount24h), 0);
  const maxHolderCount = Math.max(...candidates.map((candidate) => candidate.holderCount), 0);
  const maxHolderDelta = Math.max(
    ...candidates.map((candidate) => (candidate.holderDelta24h !== null ? candidate.holderDelta24h : 0)),
    0,
  );

  return candidates.map((candidate) => {
    const volatilityNorm = normalizeRatio(Math.abs(candidate.priceChange24h), maxAbsChange);
    const volumeNorm = normalizeRatio(candidate.volume24h, maxVolume);
    const liquidityNorm = normalizeRatio(candidate.liquidityUsd, maxLiquidity);
    const txNorm = normalizeRatio(candidate.txCount24h, maxTxCount);
    const holderNorm = normalizeRatio(candidate.holderCount, maxHolderCount);
    const holderDeltaNorm =
      candidate.holderDelta24h !== null ? normalizeRatio(candidate.holderDelta24h, maxHolderDelta) : 0;

    const rageScore = volatilityNorm * 0.55 + txNorm * 0.2 + liquidityNorm * 0.15 + volumeNorm * 0.1;
    const ghostScore =
      maxHolderDelta > 0 && candidate.holderDelta24h !== null
        ? holderDeltaNorm * 0.55 + holderNorm * 0.15 + candidate.recencyScore * 0.15 + candidate.trendingScore * 0.15
        : candidate.trendingScore * 0.45 + holderNorm * 0.35 + candidate.recencyScore * 0.2;
    const oracleScore = volumeNorm * 0.5 + liquidityNorm * 0.3 + txNorm * 0.15 + holderNorm * 0.05;
    const hypeScore =
      volatilityNorm * 0.22 +
      volumeNorm * 0.2 +
      liquidityNorm * 0.18 +
      txNorm * 0.15 +
      holderNorm * 0.08 +
      candidate.trendingScore * 0.1 +
      candidate.recencyScore * 0.07;

    return {
      ...candidate,
      rageScore,
      ghostScore,
      oracleScore,
      hypeScore,
      strategyScore: hypeScore,
    };
  });
}

function sortByScore<T extends CandidateToken>(tokens: T[], scoreKey: "rageScore" | "ghostScore" | "oracleScore" | "hypeScore"): T[] {
  return [...tokens].sort((left, right) => {
    const scoreDelta = right[scoreKey] - left[scoreKey];
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return right.hypeScore - left.hypeScore;
  });
}

function pickUniqueToken(tokens: CandidateToken[], usedAddresses: Set<string>, fallbackIndex = 0): CandidateToken | null {
  for (const token of tokens) {
    if (!usedAddresses.has(token.address)) {
      return token;
    }
  }

  if (tokens.length === 0) {
    return null;
  }

  return tokens[fallbackIndex % tokens.length];
}

function buildGlitchPool(tokens: CandidateToken[], dailySeed: number): CandidateToken[] {
  return [...tokens].sort((left, right) => {
    const leftHash = getRandomHash(`${dailySeed}:${left.address}`);
    const rightHash = getRandomHash(`${dailySeed}:${right.address}`);
    return leftHash - rightHash;
  });
}

async function discoverCandidateTokens(nowMs = Date.now()): Promise<CandidateToken[]> {
  const inkyTokens = await fetchInkyPumpPages();
  if (inkyTokens.length === 0) {
    throw new Error("No hype tokens available from InkyPump at this time");
  }

  const pairByAddress = await fetchDexPairsByToken(inkyTokens);
  const holderDeltaByAddress = await updateHolderSnapshots(
    inkyTokens.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      holderCount: token.holderCount,
    })),
    nowMs,
  );

  const candidates = buildCandidates(inkyTokens, pairByAddress, holderDeltaByAddress, nowMs);
  if (candidates.length < 4) {
    throw new Error("Not enough hype tokens found on Ink to assign all agents");
  }

  return candidates;
}

async function computeDailyAgentTokenPicks(nowMs = Date.now()): Promise<TokenPickMap> {
  const dailySeed = getDailySeed(nowMs);
  const candidates = await discoverCandidateTokens(nowMs);

  const ragePool = sortByScore(candidates, "rageScore");
  const ghostPool = sortByScore(candidates, "ghostScore");
  const oraclePool = sortByScore(candidates, "oracleScore");
  const glitchSource = sortByScore(candidates, "hypeScore").slice(0, Math.min(12, candidates.length));
  const glitchPool = buildGlitchPool(glitchSource.length > 0 ? glitchSource : candidates, dailySeed);

  const usedAddresses = new Set<string>();

  const rageToken = pickUniqueToken(ragePool, usedAddresses);
  if (!rageToken) {
    throw new Error("Unable to pick a token for RAGE");
  }
  usedAddresses.add(rageToken.address);

  const ghostToken = pickUniqueToken(ghostPool, usedAddresses, dailySeed + 1);
  if (!ghostToken) {
    throw new Error("Unable to pick a token for GHOST");
  }
  usedAddresses.add(ghostToken.address);

  const oracleToken = pickUniqueToken(oraclePool, usedAddresses, dailySeed + 2);
  if (!oracleToken) {
    throw new Error("Unable to pick a token for ORACLE");
  }
  usedAddresses.add(oracleToken.address);

  const glitchToken = pickUniqueToken(glitchPool, usedAddresses, dailySeed + 3);
  if (!glitchToken) {
    throw new Error("Unable to pick a token for GLITCH");
  }

  return {
    0: {
      agentId: 0,
      strategy: STRATEGY_NAMES[0],
      token: { ...rageToken, strategyScore: rageToken.rageScore },
    },
    1: {
      agentId: 1,
      strategy: STRATEGY_NAMES[1],
      token: { ...ghostToken, strategyScore: ghostToken.ghostScore },
    },
    2: {
      agentId: 2,
      strategy: STRATEGY_NAMES[2],
      token: { ...oracleToken, strategyScore: oracleToken.oracleScore },
    },
    3: {
      agentId: 3,
      strategy: STRATEGY_NAMES[3],
      token: { ...glitchToken, strategyScore: glitchToken.hypeScore },
    },
  };
}

export function getDiscoveryDailySeed(nowMs = Date.now()): number {
  return getDailySeed(nowMs);
}

export async function getDailyAgentTokenPicks(nowMs = Date.now()): Promise<TokenPickMap> {
  const dailySeed = getDailySeed(nowMs);

  if (cachedDailyPickState && cachedDailyPickState.dailySeed === dailySeed) {
    return cachedDailyPickState.promise;
  }

  const promise = computeDailyAgentTokenPicks(nowMs);
  cachedDailyPickState = {
    dailySeed,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    if (cachedDailyPickState?.promise === promise) {
      cachedDailyPickState = null;
    }
    throw error;
  }
}

export async function agentPickToken(agentId: AgentId, nowMs = Date.now()): Promise<DiscoveredInkToken> {
  const picks = await getDailyAgentTokenPicks(nowMs);
  return picks[agentId].token;
}
