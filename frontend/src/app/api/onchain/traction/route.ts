import { NextResponse } from "next/server";

import { getOnchainTractionSummary } from "@/lib/server/onchainTractionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const networkId = url.searchParams.get("network");
  const summary = await getOnchainTractionSummary(networkId);

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
