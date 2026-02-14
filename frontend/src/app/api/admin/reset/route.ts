import { NextRequest, NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/server/adminAuth";
import { resetMatch } from "@/lib/server/matchStore";

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

  const match = await resetMatch();

  return NextResponse.json({
    ok: true,
    match,
  });
}