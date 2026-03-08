import { NextResponse } from "next/server";

import { getArenaSidecarCurrentEpochId } from "@/lib/arenaSidecar";
import { getAgentTokenPicksForEpoch, getDiscoveryDailySeed } from "@/lib/server/tokenDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentEpochId = await getArenaSidecarCurrentEpochId();
    const fallbackEpochId = getDiscoveryDailySeed();
    const epochId = Number(currentEpochId ?? BigInt(fallbackEpochId));
    const picks = await getAgentTokenPicksForEpoch(currentEpochId ?? BigInt(fallbackEpochId));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      epochId,
      dailySeed: epochId,
      picks: Object.values(picks),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load agent token picks",
      },
      { status: 500 },
    );
  }
}
