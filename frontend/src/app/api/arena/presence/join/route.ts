import { NextResponse } from "next/server";

import { joinArenaPresence } from "@/lib/server/arenaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { sessionId?: string };
    const result = await joinArenaPresence(payload.sessionId);

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
