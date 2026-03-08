import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthorized } from "@/lib/server/arenaOracle";
import { syncCurrentArenaEpochStart } from "@/lib/server/arenaEpochSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncCurrentArenaEpochStart();

    result.actions.forEach((entry) => {
      console.log(
        `Arena epoch-start sync | epoch ${result.epochId} | agent ${entry.agentId} | ${entry.action}: ${entry.tokenSymbol} (${entry.tokenAddress})${entry.txHash ? ` | tx ${entry.txHash}` : ""}`,
      );
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Arena epoch-start sync failed",
      },
      { status: 500 },
    );
  }
}
