import "server-only";

import { DEFAULT_ARENA_NETWORK_ID, type ArenaNetworkId, getArenaNetworkConfig } from "@/lib/arenaNetworks";
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
  priceUsd?: string | number;
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

interface LitvmStaticTokenSeed {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange24h: number;
  volume24h: number;
  holderCount: number;
  liquidityUsd: number;
  txCount24h: number;
  createdAt: string;
}

const INKYPUMP_API_BASE_URL = "https://inkypump.com/api";
const DEXSCREENER_API_BASE_URL = "https://api.dexscreener.com";
const DEXSCREENER_CHAIN_ID = "ink";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_BATCH_SIZE = 30;

const LITVM_STATIC_TOKEN_SEEDS: LitvmStaticTokenSeed[] = [
  {
    address: "0xd141F870aC7aD1912b20bda552A9676f831B5F2f",
    symbol: "WZKLTC",
    name: "Wrapped zkLTC",
    priceUsd: 84.12,
    priceChange24h: 1.8,
    volume24h: 12_400,
    holderCount: 320,
    liquidityUsd: 86_000,
    txCount24h: 142,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    address: "0xa511bC66937B7ab51cf195441dA7FC6793D8B616",
    symbol: "LITGOV",
    name: "LitGovToken",
    priceUsd: 0.034,
    priceChange24h: 6.2,
    volume24h: 8_700,
    holderCount: 180,
    liquidityUsd: 42_000,
    txCount24h: 118,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    address: "0x5d4562B3F4F68c913eCaD2366e72CcE0a7f8a2a1",
    symbol: "LESTER",
    name: "Lester Labs Token Factory",
    priceUsd: 0.012,
    priceChange24h: -2.4,
    volume24h: 6_200,
    holderCount: 140,
    liquidityUsd: 31_000,
    txCount24h: 96,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    address: "0x9b0Ae242F81D456676E9b7CFe71B3cC83b8b9f56",
    symbol: "LITESWAP",
    name: "LiteSwap Community Token",
    priceUsd: 0.008,
    priceChange24h: 3.7,
    volume24h: 4_900,
    holderCount: 110,
    liquidityUsd: 24_000,
    txCount24h: 77,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
];

function normalizeLitvmStaticTokenSeed(value: unknown): LitvmStaticTokenSeed | null {
  if (!isRecord(value)) {
    return null;
  }

  const address = typeof value.address === "string" ? value.address.trim() : "";
  const symbol = typeof value.symbol === "string" ? value.symbol.trim().toUpperCase() : "";
  const name = typeof value.name === "string" ? value.name.trim() : symbol;

  if (!address || !symbol || !name) {
    return null;
  }

  return {
    address,
    symbol,
    name,
    priceUsd: toNumber(value.priceUsd),
    priceChange24h: toNumber(value.priceChange24h),
    volume24h: toNumber(value.volume24h),
    holderCount: toNumber(value.holderCount),
    liquidityUsd: toNumber(value.liquidityUsd),
    txCount24h: toNumber(value.txCount24h),
    createdAt:
      typeof value.createdAt === "string" && !Number.isNaN(new Date(value.createdAt).getTime())
        ? new Date(value.createdAt).toISOString()
        : "2025-01-01T00:00:00.000Z",
  };
}

function getLitvmStaticTokenSeeds(): LitvmStaticTokenSeed[] {
  const raw = process.env.LITVM_STATIC_TOKENS_JSON?.trim();
  if (!raw) {
    return LITVM_STATIC_TOKEN_SEEDS;
  }

  try {
    const parsed = JSON.parse(raw);
    const tokens = Array.isArray(parsed)
      ? parsed.map(normalizeLitvmStaticTokenSeed).filter((token): token is LitvmStaticTokenSeed => token !== null)
      : [];

    return tokens.length >= 4 ? tokens.slice(0, 4) : LITVM_STATIC_TOKEN_SEEDS;
  } catch {
    return LITVM_STATIC_TOKEN_SEEDS;
  }
}

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

const cachedEpochPickStates = new Map<string, Promise<TokenPickMap>>();

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

function getEpochSeed(epochId: bigint | number): number {
  if (typeof epochId === "bigint") {
    return Number(epochId);
  }

  return Math.max(0, Math.trunc(epochId));
}

function getFallbackEpochSeed(nowMs = Date.now()): number {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function normalizeInkyToken(token: InkyPumpToken | null | undefined, sourceRank: { trendingRank: number | null; newestRank: number | null }): RankedInkyToken | null {
  if (!isRecord(token)) {
    return null;
  }

  const rawToken = token as InkyPumpToken;
  const address = normalizeAddress(rawToken.address);
  const symbol = (rawToken.ticker || "").trim().toUpperCase();
  const name = (rawToken.name || "").trim();

  if (!address || address === ZERO_ADDRESS || !symbol || !name) {
    return null;
  }

  return {
    address,
    symbol,
    name,
    priceChange24h: toNumber(rawToken.price_change_24h),
    volume24h: toNumber(rawToken.volume_24h),
    holderCount: toNumber(rawToken.total_holders),
    circulatingMarketCap: toNumber(rawToken.market_cap),
    txCount24h: toNumber(rawToken.txns_24h_buys) + toNumber(rawToken.txns_24h_sells),
    socialCount: countSocials(rawToken),
    createdAt: parseCreatedAt(rawToken.created_at),
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
    if (!isRecord(pair)) {
      continue;
    }

    const dexPair = pair as DexPair;
    const baseAddress = normalizeAddress(dexPair.baseToken?.address);
    const quoteAddress = normalizeAddress(dexPair.quoteToken?.address);
    if (baseAddress !== normalizedAddress && quoteAddress !== normalizedAddress) {
      continue;
    }

    const liquidityUsd = toNumber(dexPair.liquidity?.usd);
    if (liquidityUsd > bestLiquidity) {
      bestLiquidity = liquidityUsd;
      bestPair = dexPair;
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
      if (!isRecord(pair)) {
        continue;
      }

      const dexPair = pair as DexPair;
      const baseAddress = normalizeAddress(dexPair.baseToken?.address);
      const quoteAddress = normalizeAddress(dexPair.quoteToken?.address);

      if (baseAddress) {
        groupedPairs.set(baseAddress, [...(groupedPairs.get(baseAddress) || []), dexPair]);
      }

      if (quoteAddress && quoteAddress !== baseAddress) {
        groupedPairs.set(quoteAddress, [...(groupedPairs.get(quoteAddress) || []), dexPair]);
      }
    }

    for (const address of batch) {
      pairByAddress.set(address, pickBestPair(address, groupedPairs.get(address) || []));
    }
  }

  return pairByAddress;
}

async function fetchDexPairsByAddress(addresses: string[]): Promise<Map<string, DexPair | null>> {
  const pairByAddress = new Map<string, DexPair | null>();

  for (const batch of chunkArray(addresses, DEFAULT_BATCH_SIZE)) {
    const response = await fetchJson<DexPair[]>(
      `${DEXSCREENER_API_BASE_URL}/tokens/v1/${DEXSCREENER_CHAIN_ID}/${batch.join(",")}`,
    );

    const pairs = Array.isArray(response) ? response : [];
    const groupedPairs = new Map<string, DexPair[]>();

    for (const pair of pairs) {
      if (!isRecord(pair)) {
        continue;
      }

      const dexPair = pair as DexPair;
      const baseAddress = normalizeAddress(dexPair.baseToken?.address);
      const quoteAddress = normalizeAddress(dexPair.quoteToken?.address);

      if (baseAddress) {
        groupedPairs.set(baseAddress, [...(groupedPairs.get(baseAddress) || []), dexPair]);
      }

      if (quoteAddress && quoteAddress !== baseAddress) {
        groupedPairs.set(quoteAddress, [...(groupedPairs.get(quoteAddress) || []), dexPair]);
      }
    }

    for (const address of batch) {
      pairByAddress.set(address, pickBestPair(address, groupedPairs.get(address) || []));
    }
  }

  return pairByAddress;
}

export interface LiveArenaTokenMetrics {
  address: string;
  symbol: string;
  priceUsd: number;
  volume24h: number;
  holderCount: number;
  liquidityUsd: number;
  txCount24h: number;
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

function getNetworkEpochCacheKey(networkId: ArenaNetworkId, epochSeed: number): string {
  return `${networkId}:${epochSeed}`;
}

function makeExplorerUrl(networkId: ArenaNetworkId, address: string): string | null {
  const explorerUrl = getArenaNetworkConfig(networkId).explorerUrl;
  return explorerUrl ? `${explorerUrl.replace(/\/+$/, "")}/address/${address}` : null;
}

function buildLitvmStaticCandidates(networkId: ArenaNetworkId, epochSeed: number): CandidateToken[] {
  const candidates = getLitvmStaticTokenSeeds().map((seed, index) => {
    const epochJitter = ((getRandomHash(`${networkId}:${epochSeed}:${seed.address}`) % 1201) - 600) / 100;
    const priceChange24h = seed.priceChange24h + epochJitter;

    return {
      address: normalizeAddress(seed.address),
      symbol: seed.symbol,
      name: seed.name,
      priceUsd: seed.priceUsd,
      priceChange24h,
      volume24h: seed.volume24h,
      holderCount: seed.holderCount,
      circulatingMarketCap: seed.priceUsd * Math.max(seed.holderCount, 1) * 1_000,
      holderDelta24h: null,
      liquidityUsd: seed.liquidityUsd,
      txCount24h: seed.txCount24h,
      socialCount: 1,
      createdAt: seed.createdAt,
      pairAddress: null,
      pairUrl: makeExplorerUrl(networkId, seed.address),
      source: "litvm-static" as const,
      hypeScore: 0,
      strategyScore: 0,
      ghostScore: 0,
      oracleScore: 0,
      rageScore: 0,
      recencyScore: Math.max(0.2, 0.8 - index * 0.08),
      trendingScore: Math.max(0.35, 0.95 - index * 0.12),
    };
  });

  return scoreCandidates(candidates);
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
      const dexPriceUsd = toNumber(pair?.priceUsd);
      const marketCap = toNumber(pair?.marketCap) || toNumber(pair?.fdv) || token.circulatingMarketCap;

      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        priceUsd: dexPriceUsd,
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

async function discoverCandidateTokens(nowMs = Date.now(), networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID, epochSeed = getFallbackEpochSeed(nowMs)): Promise<CandidateToken[]> {
  if (networkId === "litvm") {
    return buildLitvmStaticCandidates(networkId, epochSeed);
  }

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

async function computeAgentTokenPicksForEpoch(
  epochId: bigint | number,
  nowMs = Date.now(),
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<TokenPickMap> {
  const epochSeed = getEpochSeed(epochId);
  const candidates = await discoverCandidateTokens(nowMs, networkId, epochSeed);

  const ragePool = sortByScore(candidates, "rageScore");
  const ghostPool = sortByScore(candidates, "ghostScore");
  const oraclePool = sortByScore(candidates, "oracleScore");
  const glitchSource = sortByScore(candidates, "hypeScore").slice(0, Math.min(12, candidates.length));
  const glitchPool = buildGlitchPool(glitchSource.length > 0 ? glitchSource : candidates, epochSeed);

  const usedAddresses = new Set<string>();

  const rageToken = pickUniqueToken(ragePool, usedAddresses);
  if (!rageToken) {
    throw new Error("Unable to pick a token for RAGE");
  }
  usedAddresses.add(rageToken.address);

  const ghostToken = pickUniqueToken(ghostPool, usedAddresses, epochSeed + 1);
  if (!ghostToken) {
    throw new Error("Unable to pick a token for GHOST");
  }
  usedAddresses.add(ghostToken.address);

  const oracleToken = pickUniqueToken(oraclePool, usedAddresses, epochSeed + 2);
  if (!oracleToken) {
    throw new Error("Unable to pick a token for ORACLE");
  }
  usedAddresses.add(oracleToken.address);

  const glitchToken = pickUniqueToken(glitchPool, usedAddresses, epochSeed + 3);
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
  return getFallbackEpochSeed(nowMs);
}

export async function getAgentTokenPicksForEpoch(
  epochId: bigint | number,
  nowMs = Date.now(),
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<TokenPickMap> {
  const epochSeed = getEpochSeed(epochId);
  const cacheKey = getNetworkEpochCacheKey(networkId, epochSeed);
  const cached = cachedEpochPickStates.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = computeAgentTokenPicksForEpoch(epochSeed, nowMs, networkId);
  cachedEpochPickStates.set(cacheKey, promise);

  try {
    return await promise;
  } catch (error) {
    if (cachedEpochPickStates.get(cacheKey) === promise) {
      cachedEpochPickStates.delete(cacheKey);
    }
    throw error;
  }
}

export async function getDailyAgentTokenPicks(nowMs = Date.now()): Promise<TokenPickMap> {
  return getAgentTokenPicksForEpoch(getFallbackEpochSeed(nowMs), nowMs);
}

export async function agentPickToken(agentId: AgentId, nowMs = Date.now()): Promise<DiscoveredInkToken> {
  const picks = await getDailyAgentTokenPicks(nowMs);
  return picks[agentId].token;
}

export async function getLiveAgentTokenPicksForEpoch(
  epochId: bigint | number,
  nowMs = Date.now(),
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<TokenPickMap> {
  const baselinePicks = await getAgentTokenPicksForEpoch(epochId, nowMs, networkId);
  if (networkId === "litvm") {
    return baselinePicks;
  }

  const addresses = Object.values(baselinePicks).map((pick) => pick.token.address);
  const pairByAddress = await fetchDexPairsByAddress(addresses);

  const livePicks = {} as TokenPickMap;

  (Object.values(baselinePicks) as AgentTokenPick[]).forEach((pick) => {
    const baselineToken = pick.token;
    const pair = pairByAddress.get(baselineToken.address) || null;
    const dexPriceUsd = toNumber(pair?.priceUsd);
    const dexVolume24h = toNumber(pair?.volume?.h24);
    const dexPriceChange24h = toNumber(pair?.priceChange?.h24);
    const dexLiquidityUsd = toNumber(pair?.liquidity?.usd);
    const dexTxCount = toNumber(pair?.txns?.h24?.buys) + toNumber(pair?.txns?.h24?.sells);
    const marketCap = toNumber(pair?.marketCap) || toNumber(pair?.fdv) || baselineToken.circulatingMarketCap;

    livePicks[pick.agentId] = {
      ...pick,
      token: {
        ...baselineToken,
        priceUsd: dexPriceUsd || baselineToken.priceUsd,
        priceChange24h: dexPriceChange24h || baselineToken.priceChange24h,
        volume24h: dexVolume24h || baselineToken.volume24h,
        liquidityUsd: dexLiquidityUsd || baselineToken.liquidityUsd,
        txCount24h: dexTxCount || baselineToken.txCount24h,
        circulatingMarketCap: marketCap,
        pairAddress: pair?.pairAddress || baselineToken.pairAddress,
        pairUrl: pair?.url || baselineToken.pairUrl,
      },
    };
  });

  return livePicks;
}

export async function getLiveDailyAgentTokenPicks(nowMs = Date.now()): Promise<TokenPickMap> {
  return getLiveAgentTokenPicksForEpoch(getFallbackEpochSeed(nowMs), nowMs);
}

export async function getLiveArenaTokenMetrics(
  addresses: string[],
  nowMs = Date.now(),
  networkId: ArenaNetworkId = DEFAULT_ARENA_NETWORK_ID,
): Promise<Record<string, LiveArenaTokenMetrics>> {
  const normalizedAddresses = addresses.map((address) => normalizeAddress(address)).filter((address) => address.length > 0);

  if (networkId === "litvm") {
    const staticByAddress = new Map(buildLitvmStaticCandidates(networkId, getFallbackEpochSeed(nowMs)).map((token) => [token.address, token]));
    const metricsByAddress: Record<string, LiveArenaTokenMetrics> = {};

    normalizedAddresses.forEach((address) => {
      const token = staticByAddress.get(address);
      metricsByAddress[address] = {
        address,
        symbol: token?.symbol || "UNKNOWN",
        priceUsd: token?.priceUsd ?? 0,
        volume24h: token?.volume24h ?? 0,
        holderCount: token?.holderCount ?? 0,
        liquidityUsd: token?.liquidityUsd ?? 0,
        txCount24h: token?.txCount24h ?? 0,
      };
    });

    return metricsByAddress;
  }

  const pairByAddress = await fetchDexPairsByAddress(normalizedAddresses);
  const inkyTokens = await fetchInkyPumpPages();
  const inkyByAddress = new Map(inkyTokens.map((token) => [token.address, token]));
  const holderDeltaByAddress = await updateHolderSnapshots(
    inkyTokens.map((token) => ({
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      holderCount: token.holderCount,
    })),
    nowMs,
  );

  const metricsByAddress: Record<string, LiveArenaTokenMetrics> = {};

  normalizedAddresses.forEach((address) => {
    const pair = pairByAddress.get(address) || null;
    const inkyToken = inkyByAddress.get(address) || null;
    const txCount = toNumber(pair?.txns?.h24?.buys) + toNumber(pair?.txns?.h24?.sells);

    metricsByAddress[address] = {
      address,
      symbol: inkyToken?.symbol || pair?.baseToken?.symbol || "UNKNOWN",
      priceUsd: toNumber(pair?.priceUsd),
      volume24h: toNumber(pair?.volume?.h24) || toNumber(inkyToken?.volume24h),
      holderCount: toNumber(inkyToken?.holderCount),
      liquidityUsd: toNumber(pair?.liquidity?.usd),
      txCount24h: txCount || toNumber(inkyToken?.txCount24h),
    };

    if (holderDeltaByAddress[address] === null && metricsByAddress[address].holderCount === 0 && inkyToken) {
      metricsByAddress[address].holderCount = inkyToken.holderCount;
    }
  });

  return metricsByAddress;
}
