import { NextRequest, NextResponse } from "next/server";

import { getArenaNetworkId } from "@/lib/arenaNetworks";
import { joinArenaPresence } from "@/lib/server/arenaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const networkId = getArenaNetworkId(request.nextUrl.searchParams.get("chain"));
    const payload = (await request.json().catch(() => ({}))) as { sessionId?: string };
    const result = await joinArenaPresence(payload.sessionId, networkId);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to join arena presence",
      },
      { status: 400 },
    );
  }
}
