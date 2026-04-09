"use client";

import type { AnalyticsTrackPayload } from "@/lib/analyticsTypes";

const SESSION_KEY = "phonk_arena_analytics_session";
const ONCE_PREFIX = "phonk_arena_analytics_once:";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `pa_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

export function getAnalyticsSessionId(): string {
  if (!isBrowser()) {
    return "server";
  }

  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const next = makeSessionId();
  window.sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

function hasOnceToken(token: string): boolean {
  if (!isBrowser()) {
    return false;
  }

  return window.sessionStorage.getItem(`${ONCE_PREFIX}${token}`) === "1";
}

function markOnceToken(token: string): void {
  if (!isBrowser()) {
    return;
  }

  window.sessionStorage.setItem(`${ONCE_PREFIX}${token}`, "1");
}

export async function trackEvent(payload: AnalyticsTrackPayload): Promise<void> {
  if (!isBrowser()) {
    return;
  }

  const body: AnalyticsTrackPayload = {
    ...payload,
    sessionId: payload.sessionId || getAnalyticsSessionId(),
  };

  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Analytics must never block the product flow.
  }
}

export async function trackOncePerSession(token: string, payload: AnalyticsTrackPayload): Promise<void> {
  if (hasOnceToken(token)) {
    return;
  }

  markOnceToken(token);
  await trackEvent(payload);
}
