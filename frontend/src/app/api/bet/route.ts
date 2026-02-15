import { NextResponse } from "next/server";

import { registerBet } from "@/lib/server/matchStore";
import type { BetPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isBetPayload(value: unknown): value is BetPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<BetPayload>;
  return (
    typeof payload.lobbyId === "string" &&
    (payload.side === "A" || payload.side === "B") &&
    typeof payload.amountWei === "string" &&
    typeof payload.epochId === "number" &&
    typeof payload.address === "string"
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!isBetPayload(payload)) {
      return NextResponse.json(
        {
          error: "Invalid bet payload.",
        },
        { status: 400 },
      );
    }

    const result = await registerBet(payload);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Bet failed",
      },
      { status: 400 },
    );
  }
}
