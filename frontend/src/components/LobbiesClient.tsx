"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LOBBY_IDS } from "@/lib/lobbies";
import type { LobbyTag, MatchSnapshot } from "@/lib/types";

function tagClass(tag: LobbyTag): string {
  if (tag === "HARD") {
    return "border-red-300/40 bg-red-300/15 text-red-100";
  }

  if (tag === "SOFT") {
    return "border-cyan-300/40 bg-cyan-300/15 text-cyan-100";
  }

  return "border-fuchsia-300/40 bg-fuchsia-300/15 text-fuchsia-100";
}

export function LobbiesClient() {
  const [matches, setMatches] = useState<MatchSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      try {
        const response = await fetch("/api/match?all=1", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to fetch lobbies.");
        }

        const payload = (await response.json()) as MatchSnapshot[];
        if (!Array.isArray(payload)) {
          throw new Error("Unexpected lobby payload.");
        }

        if (!stopped) {
          setMatches(payload);
          setError(null);
        }
      } catch (fetchError) {
        if (!stopped) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch lobbies.");
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

  const orderedMatches = useMemo(() => {
    const map = new Map(matches.map((match) => [match.lobbyId, match]));
    return LOBBY_IDS.map((lobbyId) => map.get(lobbyId)).filter((match): match is MatchSnapshot =>
      Boolean(match),
    );
  }, [matches]);

  if (error) {
    return <p className="text-red-300">{error}</p>;
  }

  if (orderedMatches.length === 0) {
    return <p className="text-white/80">Loading lobbies...</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {orderedMatches.map((match) => {
        const isLive = match.status === "LIVE";

        return (
          <article key={match.lobbyId} className="rounded-2xl border border-white/15 bg-arena-900/70 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Live Lobby</p>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tagClass(match.lobby.tag)}`}>
                {match.lobby.tag}
              </span>
            </div>

            <h2 className="mt-2 font-display text-2xl uppercase tracking-[0.1em] text-white">
              {match.lobby.displayName}
            </h2>
            <p className="mt-2 text-sm text-white/70">{match.lobby.description}</p>

            <div className="mt-4 grid gap-2 text-xs text-white/80">
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

            <Link
              href={`/lobby/${match.lobbyId}`}
              className="mt-4 inline-flex rounded-xl border border-cyan-300/55 bg-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/35"
            >
              Join
            </Link>
          </article>
        );
      })}
    </div>
  );
}
