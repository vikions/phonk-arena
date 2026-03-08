import { NextRequest, NextResponse } from "next/server";

import { isAdminAuthorized } from "@/lib/server/arenaOracle";
import { syncArenaEpochFinalize } from "@/lib/server/arenaEpochSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readRequestedEpochId(request: NextRequest): Promise<number | undefined> {
  const searchEpoch = request.nextUrl.searchParams.get("epochId");
  if (searchEpoch) {
    const parsed = Number(searchEpoch);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  try {
    const body = (await request.json()) as { epochId?: number | string };
    if (typeof body?.epochId === "undefined") {
      return undefined;
    }

    const parsed = Number(body.epochId);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const epochId = await readRequestedEpochId(request);
    const result = await syncArenaEpochFinalize(epochId);

    if (result.action === "finalized") {
      console.log(
        `Arena epoch-finalize sync | epoch ${result.epochId} | finalized | tx ${result.txHash}`,
      );
    } else {
      console.log(
        `Arena epoch-finalize sync | epoch ${result.epochId} | ${result.action}${"reason" in result && result.reason ? ` | ${result.reason}` : ""}`,
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Arena epoch-finalize sync failed",
      },
      { status: 500 },
    );
  }
}
