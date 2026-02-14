import { NextResponse } from "next/server";

import { getAllMatchSnapshots, getMatchSnapshot } from "@/lib/server/matchStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lobbyId = searchParams.get("lobbyId") ?? undefined;
  const includeAll = searchParams.get("all") === "1";

  const payload = includeAll ? await getAllMatchSnapshots() : await getMatchSnapshot(lobbyId);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
