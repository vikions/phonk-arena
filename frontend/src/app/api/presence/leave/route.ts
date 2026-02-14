import { NextResponse } from "next/server";

import { leavePresence } from "@/lib/server/matchStore";

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

    const snapshot = await leavePresence(lobbyId, sessionId);

    return NextResponse.json({
      listeners: snapshot.listeners,
      status: snapshot.status,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Leave failed",
      },
      { status: 400 },
    );
  }
}
