import { NextResponse } from "next/server";

import type { AnalyticsTrackPayload } from "@/lib/analyticsTypes";
import { trackAnalyticsEvent } from "@/lib/server/analyticsStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_EVENT_NAMES = new Set<AnalyticsTrackPayload["eventName"]>([
  "landing_view",
  "foyer_view",
  "battle_view",
  "wallet_connected",
  "bet_submitted",
  "bet_confirmed",
  "claim_submitted",
  "claim_confirmed",
]);

function isTrackPayload(value: unknown): value is AnalyticsTrackPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<AnalyticsTrackPayload>;
  return typeof payload.eventName === "string" && VALID_EVENT_NAMES.has(payload.eventName as AnalyticsTrackPayload["eventName"]);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!isTrackPayload(payload)) {
      return NextResponse.json({ error: "Invalid analytics payload." }, { status: 400 });
    }

    await trackAnalyticsEvent(payload);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics tracking failed." },
      { status: 500 },
    );
  }
}
