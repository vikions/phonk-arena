import { NextRequest, NextResponse } from "next/server";

import { getCurrentEpochId } from "@/lib/contract";
import { agentPickToken } from "@/lib/tokenDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return false;
  }

  const authorization = request.headers.get("authorization")?.trim() || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : authorization;

  return token === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const selections = await Promise.all(
    ([0, 1, 2, 3] as const).map(async (agentId) => {
      const token = await agentPickToken(agentId);
      console.log(
        `Agent ${agentId} picked: ${token.symbol} | change: ${token.priceChange24h}% | volume: ${token.volume24h}`,
      );
      return {
        agentId,
        token: {
          symbol: token.symbol,
          address: token.address,
          priceChange24h: token.priceChange24h,
          volume24h: token.volume24h,
        },
      };
    }),
  );

  // TODO: call recordTokenSelection on contract after ABI is ready.

  return NextResponse.json({
    epochId: Number(getCurrentEpochId()),
    selections,
  });
}
