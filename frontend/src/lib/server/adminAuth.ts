import type { NextRequest } from "next/server";

export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return false;
  }

  const fromHeader = request.headers.get("x-admin-secret");
  if (fromHeader && fromHeader === secret) {
    return true;
  }

  try {
    const payload = (await request.clone().json()) as { secret?: string };
    return payload.secret === secret;
  } catch {
    return false;
  }
}