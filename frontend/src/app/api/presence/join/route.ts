import { NextResponse } from "next/server";

import { joinPresence } from "@/lib/server/matchStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PresencePayload {
  lobbyId?: string;
  sessionId?: string;
}

export async function POST(request: Request) {
  try {
    let lobbyId: string | undefined;
    let sessionId: string | undefined;

    try {
      const payload = (await request.json()) as PresencePayload;
      lobbyId = payload.lobbyId;
      sessionId = payload.sessionId;
    } catch {
      lobbyId = undefined;
      sessionId = undefined;
    }

    const { sessionId: resolvedSessionId, snapshot } = await joinPresence(lobbyId, sessionId);

    return NextResponse.json({
      sessionId: resolvedSessionId,
      listeners: snapshot.listeners,
      status: snapshot.status,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Join failed",
      },
      { status: 400 },
    );
  }
}
