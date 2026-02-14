import { NextResponse } from "next/server";

import { getMatchSnapshot } from "@/lib/server/matchStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const match = await getMatchSnapshot();

  return NextResponse.json(match, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}