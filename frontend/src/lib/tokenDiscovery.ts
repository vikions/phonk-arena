const BLOCKSCOUT_API =
  process.env.NEXT_PUBLIC_BLOCKSCOUT_API || "https://explorer.inkonchain.com/api/v2";

export interface InkToken {
  address: string;
  symbol: string;
  name: string;
  priceChange24h: number;
  volume24h: number;
  holderCount: number;
  circulatingMarketCap: number;
}

interface BlockscoutTokenItem {
  address?: { hash?: string } | string;
  symbol?: string;
  name?: string;
  exchange_rate?: string;
  volume_24h?: string;
  holders?: string;
  holder_count?: string;
  circulating_market_cap?: string;
}

type AgentId = 0 | 1 | 2 | 3;
type TokenPickMap = Record<AgentId, InkToken>;
interface FilterTier {
  minHolders: number;
  minVolume24h: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEFAULT_FETCH_LIMIT = 100;

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
  "dai",
  "wrapped ether",
  "wrapped bitcoin",
  "staked ether",
  "rocket pool ether",
  "bridged usdc",
  "bridged usdt",
];

const FILTER_TIERS: FilterTier[] = [
  { minHolders: 50, minVolume24h: 1_000 },
  { minHolders: 20, minVolume24h: 250 },
  { minHolders: 10, minVolume24h: 50 },
  { minHolders: 3, minVolume24h: 1 },
];

let cachedDailyPicks:
  | {
      dailySeed: number;
      promise: Promise<TokenPickMap>;
    }
  | null = null;

async function fetchTokenList(url: string): Promise<InkToken[]> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as { items?: BlockscoutTokenItem[] };
    return (data.items || []).map(normalizeToken);
  } catch {
    return [];
  }
}

function normalizeToken(item: BlockscoutTokenItem): InkToken {
  const addressValue =
    typeof item.address === "string"
      ? item.address
      : typeof item.address?.hash === "string"
        ? item.address.hash
        : "";

  return {
    address: addressValue,
    symbol: item.symbol || "UNKNOWN",
    name: item.name || "Unknown Token",
    priceChange24h: parseFloat(item.exchange_rate || "0"),
    volume24h: parseFloat(item.volume_24h || "0"),
    holderCount: parseInt(item.holders || item.holder_count || "0", 10),
    circulatingMarketCap: parseFloat(item.circulating_market_cap || "0"),
  };
}

function isAddressUsable(address: string): boolean {
  return Boolean(address) && address.toLowerCase() !== ZERO_ADDRESS;
}

function isInterestingToken(token: InkToken, tier: FilterTier = FILTER_TIERS[0]): boolean {
  const symbol = token.symbol.trim().toUpperCase();
  const name = token.name.trim().toLowerCase();

  if (!isAddressUsable(token.address)) {
    return false;
  }

  if (!symbol || symbol === "UNKNOWN") {
    return false;
  }

  if (BLACKLIST_SYMBOLS.includes(symbol)) {
    return false;
  }

  if (BLACKLIST_NAME_SNIPPETS.some((snippet) => name.includes(snippet))) {
    return false;
  }

  if (token.holderCount < tier.minHolders) {
    return false;
  }

  if (token.volume24h < tier.minVolume24h) {
    return false;
  }

  return true;
}

function dedupeTokens(tokens: InkToken[]): InkToken[] {
  const seen = new Set<string>();
  const unique: InkToken[] = [];

  for (const token of tokens) {
    const key = token.address.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(token);
  }

  return unique;
}

function applyInterestFilter(tokens: InkToken[], limit: number): InkToken[] {
  const uniqueTokens = dedupeTokens(tokens);

  for (const tier of FILTER_TIERS) {
    const filtered = uniqueTokens.filter((token) => isInterestingToken(token, tier));
    if (filtered.length > 0) {
      return filtered.slice(0, limit);
    }
  }

  return [];
}

function tokenScoreHash(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getDailySeed(nowMs = Date.now()): number {
  return Math.floor(nowMs / 86_400_000);
}

function getRandomizedOrder(tokens: InkToken[], dailySeed: number): InkToken[] {
  return [...tokens].sort((left, right) => {
    const leftScore = tokenScoreHash(`${dailySeed}:${left.address}`);
    const rightScore = tokenScoreHash(`${dailySeed}:${right.address}`);
    return leftScore - rightScore;
  });
}

function pickFirstUnused(rankedTokens: InkToken[], usedAddresses: Set<string>, fallbackIndex = 0): InkToken | null {
  for (const token of rankedTokens) {
    if (!usedAddresses.has(token.address.toLowerCase())) {
      return token;
    }
  }

  if (rankedTokens.length === 0) {
    return null;
  }

  return rankedTokens[fallbackIndex % rankedTokens.length];
}

async function getRankedTokenPools(limit = DEFAULT_FETCH_LIMIT): Promise<{
  byVolume: InkToken[];
  byHolders: InkToken[];
  merged: InkToken[];
}> {
  const [volumeRaw, holdersRaw] = await Promise.all([
    fetchTokenList(`${BLOCKSCOUT_API}/tokens?type=ERC-20&sort=volume_24h&order=desc&limit=${limit}`),
    fetchTokenList(`${BLOCKSCOUT_API}/tokens?type=ERC-20&sort=holder_count&order=desc&limit=${limit}`),
  ]);

  const byVolume = applyInterestFilter(volumeRaw, limit);
  const byHolders = applyInterestFilter(holdersRaw, limit);
  const merged = dedupeTokens([...byVolume, ...byHolders]);

  if (merged.length === 0) {
    throw new Error("No interesting tokens found on Ink at this time");
  }

  return { byVolume, byHolders, merged };
}

function rankForRage(tokens: InkToken[]): InkToken[] {
  return [...tokens].sort((left, right) => {
    const changeDelta = Math.abs(right.priceChange24h) - Math.abs(left.priceChange24h);
    if (changeDelta !== 0) {
      return changeDelta;
    }

    const volumeDelta = right.volume24h - left.volume24h;
    if (volumeDelta !== 0) {
      return volumeDelta;
    }

    return right.holderCount - left.holderCount;
  });
}

function rankForGhost(tokens: InkToken[]): InkToken[] {
  return [...tokens].sort((left, right) => {
    const holderDelta = right.holderCount - left.holderCount;
    if (holderDelta !== 0) {
      return holderDelta;
    }

    const volumeDelta = right.volume24h - left.volume24h;
    if (volumeDelta !== 0) {
      return volumeDelta;
    }

    return Math.abs(right.priceChange24h) - Math.abs(left.priceChange24h);
  });
}

function rankForOracle(tokens: InkToken[]): InkToken[] {
  return [...tokens].sort((left, right) => {
    const volumeDelta = right.volume24h - left.volume24h;
    if (volumeDelta !== 0) {
      return volumeDelta;
    }

    const holderDelta = right.holderCount - left.holderCount;
    if (holderDelta !== 0) {
      return holderDelta;
    }

    return Math.abs(right.priceChange24h) - Math.abs(left.priceChange24h);
  });
}

async function computeDailyAgentTokenPicks(nowMs = Date.now()): Promise<TokenPickMap> {
  const dailySeed = getDailySeed(nowMs);
  const { byVolume, byHolders, merged } = await getRankedTokenPools();

  const ragePool = rankForRage(merged);
  const ghostPool = rankForGhost(byHolders.length > 0 ? byHolders : merged);
  const oraclePool = rankForOracle(byVolume.length > 0 ? byVolume : merged);
  const glitchPool = getRandomizedOrder(merged, dailySeed);

  const usedAddresses = new Set<string>();
  const picks = {} as TokenPickMap;

  const ragePick = pickFirstUnused(ragePool, usedAddresses);
  if (!ragePick) {
    throw new Error("No interesting tokens found on Ink at this time");
  }
  picks[0] = ragePick;
  usedAddresses.add(ragePick.address.toLowerCase());

  const ghostPick = pickFirstUnused(ghostPool, usedAddresses, dailySeed + 1);
  if (!ghostPick) {
    throw new Error("No interesting tokens found on Ink at this time");
  }
  picks[1] = ghostPick;
  usedAddresses.add(ghostPick.address.toLowerCase());

  const oraclePick = pickFirstUnused(oraclePool, usedAddresses, dailySeed + 2);
  if (!oraclePick) {
    throw new Error("No interesting tokens found on Ink at this time");
  }
  picks[2] = oraclePick;
  usedAddresses.add(oraclePick.address.toLowerCase());

  const glitchPick = pickFirstUnused(glitchPool, usedAddresses, dailySeed + 3);
  if (!glitchPick) {
    throw new Error("No interesting tokens found on Ink at this time");
  }
  picks[3] = glitchPick;

  return picks;
}

export async function getTopTokensByVolume(limit = 20): Promise<InkToken[]> {
  const rawTokens = await fetchTokenList(
    `${BLOCKSCOUT_API}/tokens?type=ERC-20&sort=volume_24h&order=desc&limit=${Math.max(limit * 5, DEFAULT_FETCH_LIMIT)}`,
  );
  return applyInterestFilter(rawTokens, limit);
}

export async function getTopTokensByHolderCount(limit = 20): Promise<InkToken[]> {
  const rawTokens = await fetchTokenList(
    `${BLOCKSCOUT_API}/tokens?type=ERC-20&sort=holder_count&order=desc&limit=${Math.max(limit * 5, DEFAULT_FETCH_LIMIT)}`,
  );
  return applyInterestFilter(rawTokens, limit);
}

export async function getDailyAgentTokenPicks(nowMs = Date.now()): Promise<TokenPickMap> {
  const dailySeed = getDailySeed(nowMs);

  if (cachedDailyPicks && cachedDailyPicks.dailySeed === dailySeed) {
    return cachedDailyPicks.promise;
  }

  const promise = computeDailyAgentTokenPicks(nowMs);
  cachedDailyPicks = {
    dailySeed,
    promise,
  };

  try {
    return await promise;
  } catch (error) {
    if (cachedDailyPicks?.promise === promise) {
      cachedDailyPicks = null;
    }
    throw error;
  }
}

// Each agent picks by its own strategy. Picks are deterministic for the day.
export async function agentPickToken(agentId: AgentId): Promise<InkToken> {
  const picks = await getDailyAgentTokenPicks();
  const token = picks[agentId];

  if (!token) {
    throw new Error("No interesting tokens found on Ink at this time");
  }

  return token;
}
