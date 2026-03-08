"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { generateAgentTrack } from "@/lib/musicEngine";
import type { AgentDNA } from "@/lib/musicEngine";
import type { InkToken } from "@/lib/tokenDiscovery";

interface AgentCardProps {
  agentId: 0 | 1 | 2 | 3;
  token: InkToken | null;
  dna: AgentDNA;
  wins: number;
  losses: number;
  onBet: (agentId: number, amount: string) => void;
}

const AGENT_META: Record<AgentCardProps["agentId"], { name: string; emoji: string }> = {
  0: { name: "RAGE", emoji: "🔴" },
  1: { name: "GHOST", emoji: "🔵" },
  2: { name: "ORACLE", emoji: "🟡" },
  3: { name: "GLITCH", emoji: "🟢" },
};

export function AgentCard({ agentId, token, dna, wins, losses, onBet }: AgentCardProps) {
  const [betAmount, setBetAmount] = useState("0.01");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const playerRef = useRef<{ stop: () => void } | null>(null);

  const agent = useMemo(() => AGENT_META[agentId], [agentId]);

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, []);

  async function toggleTrack() {
    if (!token) {
      return;
    }

    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
      setIsPlaying(false);
      return;
    }

    try {
      setPlayError(null);
      const player = await generateAgentTrack(token, dna);
      playerRef.current = player;
      setIsPlaying(true);
    } catch {
      setPlayError("Unable to play track.");
    }
  }

  function handleBet() {
    onBet(agentId, betAmount.trim());
  }

  return (
    <article className="rounded-2xl border border-[#6C3483] bg-[#0d0d1a] p-4 text-white shadow-[0_12px_40px_rgba(108,52,131,0.2)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-[0.08em]">
            {agent.emoji} {agent.name}
          </h3>
          <p className="mt-1 inline-flex rounded-full border border-[#6C3483] bg-[#6C3483]/20 px-2 py-1 text-xs font-mono">
            {dna.mutationVersion > 0 ? `Mutation ${dna.mutationVersion}` : "Arena Ready"}
          </p>
        </div>
        <p className="text-right text-sm font-mono text-white/80">
          {wins}W / {losses}L
        </p>
      </div>

      <div className="mt-4 space-y-1 text-sm font-mono text-white/85">
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-white/60">Token Pick</p>
        {token ? (
          <>
            <p className="text-base font-semibold font-sans text-white">
              {token.symbol} <span className="text-xs text-white/60">({token.name})</span>
            </p>
            <p>24h: {token.priceChange24h.toFixed(2)}%</p>
            <p>Vol: {token.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            <Link
              className="inline-flex text-xs font-sans text-[#caa0dc] underline-offset-4 hover:underline"
              href={`https://explorer.inkonchain.com/token/${token.address}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Blockscout
            </Link>
          </>
        ) : (
          <p className="text-white/60">Waiting...</p>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          onClick={() => void toggleTrack()}
          disabled={!token}
          className="rounded-lg border border-[#6C3483] bg-[#6C3483]/20 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#6C3483]/35 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPlaying ? "⏹ Stop" : "▶ Play Track"}
        </button>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            value={betAmount}
            onChange={(event) => setBetAmount(event.target.value)}
            placeholder="0.01"
            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm font-mono text-white outline-none focus:border-[#6C3483]"
          />
          <button
            type="button"
            onClick={handleBet}
            className="rounded-lg border border-[#6C3483] bg-[#6C3483]/25 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#6C3483]/35"
          >
            Place Bet
          </button>
        </div>
      </div>

      {playError ? <p className="mt-2 text-xs text-red-300">{playError}</p> : null}
    </article>
  );
}

export type { AgentCardProps };
