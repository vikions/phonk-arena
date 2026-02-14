"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { MatchSnapshot } from "@/lib/types";

export function LobbiesClient() {
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      try {
        const response = await fetch("/api/match", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to fetch lobby status.");
        }

        const data = (await response.json()) as MatchSnapshot;
        if (!stopped) {
          setMatch(data);
          setError(null);
        }
      } catch (fetchError) {
        if (!stopped) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch lobby.");
        }
      }
    };

    void load();

    const interval = setInterval(() => {
      void load();
    }, 1_000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return <p className="text-red-300">{error}</p>;
  }

  if (!match) {
    return <p className="text-white/80">Loading lobbies...</p>;
  }

  const isLive = match.status === "LIVE";

  return (
    <div className="rounded-2xl border border-white/15 bg-arena-900/70 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Active Lobby</p>
      <h2 className="mt-2 font-display text-2xl uppercase tracking-[0.12em] text-white">
        {match.lobbyId}
      </h2>

      <div className="mt-4 grid gap-2 text-sm text-white/80 sm:grid-cols-3">
        <p
          className={`rounded-xl border px-3 py-2 ${
            isLive
              ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100"
              : "border-white/15 bg-white/5"
          }`}
        >
          Status: {match.status}
        </p>
        <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
          Listeners: {match.listeners}
        </p>
        <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2">
          Match ID: {match.matchId}
        </p>
      </div>

      <p className="mt-3 text-xs text-white/65">
        Agents run in a continuous 10-second alternation while at least one listener is present.
      </p>

      <Link
        href={`/lobby/${match.lobbyId}`}
        className="mt-4 inline-flex rounded-xl border border-cyan-300/55 bg-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/35"
      >
        Join
      </Link>
    </div>
  );
}