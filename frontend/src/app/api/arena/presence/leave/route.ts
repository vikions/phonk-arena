import { NextResponse } from "next/server";

import { leaveArenaPresence } from "@/lib/server/arenaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { sessionId?: string };
    const snapshot = await leaveArenaPresence(payload.sessionId);

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to leave arena presence",
      },
      { status: 400 },
    );
  }
}
