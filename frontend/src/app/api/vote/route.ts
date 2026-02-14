import { NextResponse } from "next/server";

import { castVote } from "@/lib/server/matchStore";
import type { VotePayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isVotePayload(value: unknown): value is VotePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<VotePayload>;
  return (
    typeof payload.lobbyId === "string" &&
    typeof payload.clipId === "string" &&
    (payload.side === "A" || payload.side === "B") &&
    typeof payload.address === "string"
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!isVotePayload(payload)) {
      return NextResponse.json(
        {
          error: "Invalid vote payload.",
        },
        { status: 400 },
      );
    }

    const vote = await castVote(payload);

    return NextResponse.json(vote, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Vote failed",
      },
      { status: 400 },
    );
  }
}
