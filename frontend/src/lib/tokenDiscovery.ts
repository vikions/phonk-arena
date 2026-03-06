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

export async function getTopTokensByVolume(limit = 20): Promise<InkToken[]> {
  const tokens = await fetchTokenList(
    `${BLOCKSCOUT_API}/tokens?type=ERC-20&sort=volume_24h&order=desc&limit=${limit}`,
  );
  return tokens.filter(isInterestingToken);
}

export async function getTopTokensByHolderCount(limit = 20): Promise<InkToken[]> {
  const tokens = await fetchTokenList(
    `${BLOCKSCOUT_API}/tokens?type=ERC-20&sort=holder_count&order=desc&limit=${limit}`,
  );
  return tokens.filter(isInterestingToken);
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

function isInterestingToken(token: InkToken): boolean {
  if (BLACKLIST_SYMBOLS.includes(token.symbol.toUpperCase())) {
    return false;
  }
  if (token.holderCount < 50) {
    return false;
  }
  if (token.volume24h < 1000) {
    return false;
  }
  return true;
}

// Each agent picks by its own strategy - strategy is fixed, never changes.
export async function agentPickToken(agentId: 0 | 1 | 2 | 3): Promise<InkToken> {
  const byVolume = await getTopTokensByVolume(20);
  if (byVolume.length === 0) {
    throw new Error("No interesting tokens found on Ink at this time");
  }

  switch (agentId) {
    case 0:
      return [...byVolume].sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h))[0];
    case 1: {
      const byHolders = await getTopTokensByHolderCount(20);
      if (byHolders.length === 0) {
        throw new Error("No interesting tokens found on Ink at this time");
      }
      return byHolders[0];
    }
    case 2:
      return byVolume[0];
    case 3: {
      const dailySeed = Math.floor(Date.now() / 86_400_000);
      const pickIndex = dailySeed % Math.min(byVolume.length, 20);
      return byVolume[pickIndex];
    }
    default:
      throw new Error("No interesting tokens found on Ink at this time");
  }
}
