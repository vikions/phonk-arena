import { NextRequest, NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/server/adminAuth";
import { startMatch } from "@/lib/server/matchStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const allowed = await isAdminRequest(request);

  if (!allowed) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  let lobbyId: string | undefined;

  try {
    const payload = (await request.clone().json()) as { lobbyId?: string };
    lobbyId = payload.lobbyId;
  } catch {
    lobbyId = undefined;
  }

  const match = await startMatch(lobbyId);

  return NextResponse.json({
    ok: true,
    match,
  });
}
