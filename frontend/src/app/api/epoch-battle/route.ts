import { NextResponse } from "next/server";

import { getDailyAgentTokenPicks, getDiscoveryDailySeed } from "@/lib/server/tokenDiscovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const picks = await getDailyAgentTokenPicks();

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      dailySeed: getDiscoveryDailySeed(),
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
