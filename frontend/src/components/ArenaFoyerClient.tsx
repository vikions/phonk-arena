"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";

import { getAgentDNA } from "@/lib/contract";
import { DEFAULT_DNA } from "@/lib/musicEngine";
import type { AgentDNA } from "@/lib/musicEngine";
import type { DailyAgentPicksResponse, DiscoveredInkToken } from "@/lib/tokenDiscovery";

type ArenaAgentId = 0 | 1 | 2 | 3;

interface AgentDisplay {
  agentId: ArenaAgentId;
  name: "RAGE" | "GHOST" | "ORACLE" | "GLITCH";
  emoji: string;
  image: string;
  accent: string;
  aura: string;
  persona: string;
}

interface AgentFoyerState {
  token: DiscoveredInkToken | null;
  dna: AgentDNA;
  mutationVersion: number;
  wins: number;
  losses: number;
  strategy: string;
}

const AGENTS: AgentDisplay[] = [
  {
    agentId: 0,
    name: "RAGE",
    emoji: "RED",
    image: "/person/RAGE.png",
    accent: "#f43f5e",
    aura: "rgba(244,63,94,0.32)",
    persona: "Volatility hunter. Hunts the sharpest move in the chamber and weaponizes chaos.",
  },
  {
    agentId: 1,
    name: "GHOST",
    emoji: "BLUE",
    image: "/person/GHOST.png",
    accent: "#38bdf8",
    aura: "rgba(56,189,248,0.28)",
    persona: "Crowd whisperer. Tracks holder momentum and fades into the fastest-growing cult.",
  },
  {
    agentId: 2,
    name: "ORACLE",
    emoji: "GOLD",
    image: "/person/ORACLE.png",
    accent: "#facc15",
    aura: "rgba(250,204,21,0.25)",
    persona: "Market priest. Prefers heavy flow, deep liquidity, and conviction from the tape.",
  },
  {
    agentId: 3,
    name: "GLITCH",
    emoji: "GREEN",
    image: "/person/GLITCH.png",
    accent: "#22c55e",
    aura: "rgba(34,197,94,0.28)",
    persona: "Wild card. Pulls from the hype field with a seeded daily glitch in the matrix.",
  },
];

function defaultAgentState(agentId: ArenaAgentId): AgentFoyerState {
  return {
    token: null,
    dna: DEFAULT_DNA[agentId],
    mutationVersion: DEFAULT_DNA[agentId].mutationVersion,
    wins: 0,
    losses: 0,
    strategy: AGENTS.find((agent) => agent.agentId === agentId)?.name ?? "UNKNOWN",
  };
}

function formatCompact(value: number, digits = 1): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function ArenaFoyerClient() {
  const publicClient = usePublicClient();
  const [agentState, setAgentState] = useState<Record<ArenaAgentId, AgentFoyerState>>({
    0: defaultAgentState(0),
    1: defaultAgentState(1),
    2: defaultAgentState(2),
    3: defaultAgentState(3),
  });
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFoyer() {
      try {
        setLoading(true);
        const picksRequest = fetch("/api/epoch-battle", {
          cache: "no-store",
        });
        const dnaRequest = Promise.all(
          AGENTS.map(async (agent) => ({
            agentId: agent.agentId,
            dna: await getAgentDNA(agent.agentId, publicClient),
          })),
        );

        const [picksResponse, dnaPayload] = await Promise.all([picksRequest, dnaRequest]);
        if (!picksResponse.ok) {
          throw new Error("Failed to load agent chamber.");
        }

        const picksPayload = (await picksResponse.json()) as DailyAgentPicksResponse;
        const nextState: Record<ArenaAgentId, AgentFoyerState> = {
          0: defaultAgentState(0),
          1: defaultAgentState(1),
          2: defaultAgentState(2),
          3: defaultAgentState(3),
        };

        for (const pick of picksPayload.picks || []) {
          nextState[pick.agentId] = {
            ...nextState[pick.agentId],
            token: pick.token,
            strategy: pick.strategy,
          };
        }

        for (const entry of dnaPayload) {
          if (!entry.dna) {
            continue;
          }

          nextState[entry.agentId] = {
            ...nextState[entry.agentId],
            dna: {
              bpmRange: entry.dna.bpmRange || DEFAULT_DNA[entry.agentId].bpmRange,
              layerDensity: entry.dna.layerDensity || DEFAULT_DNA[entry.agentId].layerDensity,
              glitchIntensity: entry.dna.glitchIntensity || DEFAULT_DNA[entry.agentId].glitchIntensity,
              bassWeight: entry.dna.bassWeight || DEFAULT_DNA[entry.agentId].bassWeight,
              mutationVersion: entry.dna.mutationVersion,
            },
            mutationVersion: entry.dna.mutationVersion,
            wins: entry.dna.wins,
            losses: entry.dna.losses,
          };
        }

        if (!cancelled) {
          startTransition(() => {
            setAgentState(nextState);
            setGeneratedAt(picksPayload.generatedAt);
            setError(null);
          });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load agent chamber.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFoyer();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(7,8,16,0.96),rgba(10,18,34,0.9))] px-5 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:px-8 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(192,38,211,0.14),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.14),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.36em] text-cyan-200/70">Agent Chamber</p>
          <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="font-display text-4xl uppercase tracking-[0.12em] text-white sm:text-5xl">
                Four Matryoshka Minds. One Daily Loadout.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
                Before the battle platform opens, the chamber reveals today&apos;s holders, DNA drift, and the tokens
                each agent is carrying into the arena.
              </p>
            </div>

            <div className="grid gap-2 text-xs uppercase tracking-[0.18em] text-white/60 sm:text-sm">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Daily Sync: {generatedAt ? new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Calibrating"}
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Audio Chamber: Ambient loop active on this floor
              </div>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-3xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {error}
        </section>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {AGENTS.map((agent, index) => {
          const state = agentState[agent.agentId];

          return (
            <article
              key={agent.agentId}
              className="arena-rise group relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_16px_50px_rgba(0,0,0,0.45)]"
              style={{
                animationDelay: `${index * 120}ms`,
                boxShadow: `0 18px 50px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.04), 0 0 42px ${agent.aura}`,
              }}
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={agent.image}
                  alt={agent.name}
                  fill
                  priority
                  className="object-cover transition duration-700 group-hover:scale-[1.035]"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, rgba(8,10,18,0.15) 0%, rgba(8,10,18,0.38) 42%, rgba(5,7,14,0.95) 100%), radial-gradient(circle at top, ${agent.aura}, transparent 40%)`,
                  }}
                />
                <div className="absolute inset-x-0 top-0 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.35em] text-white/55">{agent.emoji}</p>
                      <h2 className="mt-2 font-display text-3xl uppercase tracking-[0.12em] text-white">
                        {agent.name}
                      </h2>
                    </div>
                    <span
                      className="rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 backdrop-blur-md"
                      style={{
                        borderColor: `${agent.accent}80`,
                        backgroundColor: `${agent.accent}25`,
                      }}
                    >
                      DNA v{state.mutationVersion}
                    </span>
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="rounded-[1.5rem] border border-white/10 bg-black/45 p-4 backdrop-blur-md">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/50">Held Today</p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl uppercase tracking-[0.08em] text-white">
                          {state.token?.symbol ?? (loading ? "SYNC" : "WAIT")}
                        </p>
                        <p className="mt-1 text-xs text-white/60">{agent.persona}</p>
                      </div>
                      <div className="text-right font-mono text-sm text-white/80">
                        <p>{state.wins}W / {state.losses}L</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/55">{state.strategy}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[11px] text-white/82">
                      <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">24h Move</p>
                        <p className={state.token && state.token.priceChange24h > 0 ? "text-emerald-300" : "text-red-300"}>
                          {state.token ? formatPercent(state.token.priceChange24h) : "--"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Liquidity</p>
                        <p>{state.token ? `$${formatCompact(state.token.liquidityUsd)}` : "--"}</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Transactions</p>
                        <p>{state.token ? formatCompact(state.token.txCount24h, 0) : "--"}</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">BPM Core</p>
                        <p>{state.dna.bpmRange}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/68">
                      <div className="rounded-lg border border-white/8 bg-white/5 px-2 py-2 text-center">
                        Layer {state.dna.layerDensity}
                      </div>
                      <div className="rounded-lg border border-white/8 bg-white/5 px-2 py-2 text-center">
                        Glitch {state.dna.glitchIntensity}
                      </div>
                      <div className="rounded-lg border border-white/8 bg-white/5 px-2 py-2 text-center">
                        Bass {state.dna.bassWeight}
                      </div>
                    </div>

                    {state.token?.pairUrl ? (
                      <Link
                        href={state.token.pairUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex text-[11px] uppercase tracking-[0.18em] text-white/62 transition hover:text-white"
                      >
                        Open market trace
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 px-6 py-7 text-center shadow-[0_16px_60px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.15),transparent_45%)]" />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/70">Next Floor</p>
          <h3 className="mt-3 font-display text-3xl uppercase tracking-[0.12em] text-white">
            Battle Platform
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-white/68">
            Step out of the chamber and into the live battleground. The arena module is still the current battle
            implementation while we refine the full platform flow.
          </p>
          <Link
            href="/lobby/drift-hard"
            className="arena-pulse mt-6 inline-flex rounded-full border border-cyan-300/60 bg-cyan-300/18 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/28"
          >
            Enter Battle Platform
          </Link>
        </div>
      </section>
    </div>
  );
}
