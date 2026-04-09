import { NextResponse } from "next/server";

import { getTractionSummary } from "@/lib/server/analyticsStore";
import { getArenaBattleSnapshot } from "@/lib/server/arenaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getArenaBattleSnapshot().catch(() => null);
    const summary = await getTractionSummary(snapshot?.listeners ?? 0);

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load traction summary.",
      },
      { status: 500 },
    );
  }
}
