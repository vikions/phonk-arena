import { NextResponse } from "next/server";

import { getArenaSidecarCurrentEpochId } from "@/lib/arenaSidecar";
import { getAgentRuntimeProfiles } from "@/lib/server/agentProfileStore";
import { getAgentTokenPicksForEpoch, getDiscoveryDailySeed } from "@/lib/server/tokenDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const currentEpochId = await getArenaSidecarCurrentEpochId();
    const fallbackEpochId = getDiscoveryDailySeed();
    const epochId = Number(currentEpochId ?? BigInt(fallbackEpochId));
    const [picks, profiles] = await Promise.all([
      getAgentTokenPicksForEpoch(currentEpochId ?? BigInt(fallbackEpochId)),
      getAgentRuntimeProfiles(),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      epochId,
      dailySeed: epochId,
      picks: Object.values(picks),
      profiles: Object.entries(profiles).map(([agentId, profile]) => ({
        agentId: Number(agentId),
        profile,
      })),
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
