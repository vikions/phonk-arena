import { NextResponse } from "next/server";

import { markClaimed } from "@/lib/server/matchStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClaimPayload {
  lobbyId?: string;
  epochId?: number;
  address?: string;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ClaimPayload;

    if (
      !payload ||
      typeof payload.lobbyId !== "string" ||
      typeof payload.epochId !== "number" ||
      typeof payload.address !== "string"
    ) {
      return NextResponse.json(
        {
          error: "Invalid claim payload.",
        },
        { status: 400 },
      );
    }

    await markClaimed({
      lobbyId: payload.lobbyId,
      epochId: payload.epochId,
      address: payload.address,
    });

    return NextResponse.json(
      {
        ok: true,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Claim mirror failed",
      },
      { status: 400 },
    );
  }
}
