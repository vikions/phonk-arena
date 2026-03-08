import { NextResponse } from "next/server";

import { getArenaBattleSnapshot } from "@/lib/server/arenaStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getArenaBattleSnapshot();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
