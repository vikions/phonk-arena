import { NextRequest, NextResponse } from "next/server";

import { getArenaNetworkId } from "@/lib/arenaNetworks";
import { getArenaBattleSnapshot } from "@/lib/server/arenaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const networkId = getArenaNetworkId(request.nextUrl.searchParams.get("chain"));
  const snapshot = await getArenaBattleSnapshot(Date.now(), networkId);

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
