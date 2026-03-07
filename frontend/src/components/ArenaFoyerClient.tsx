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
  image: string;
  accent: string;
  aura: string;
  role: string;
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
    image: "/person/RAGE.png",
    accent: "#f43f5e",
    aura: "rgba(244,63,94,0.32)",
    role: "Volatility Hunter",
  },
  {
    agentId: 1,
    name: "GHOST",
    image: "/person/GHOST.png",
    accent: "#38bdf8",
    aura: "rgba(56,189,248,0.28)",
    role: "Holder Whisperer",
  },
  {
    agentId: 2,
    name: "ORACLE",
    image: "/person/ORACLE.png",
    accent: "#facc15",
    aura: "rgba(250,204,21,0.25)",
    role: "Flow Reader",
  },
  {
    agentId: 3,
    name: "GLITCH",
    image: "/person/GLITCH.png",
    accent: "#22c55e",
    aura: "rgba(34,197,94,0.28)",
    role: "Chaos Seeder",
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

function getMutationStage(mutationVersion: number): string {
  if (mutationVersion >= 5) {
    return "Apex";
  }

  if (mutationVersion >= 3) {
    return "Mutant";
  }

  if (mutationVersion >= 1) {
    return "Awakened";
  }

  return "Genesis";
}

export function ArenaFoyerClient() {
  const publicClient = usePublicClient();
  const [agentState, setAgentState] = useState<Record<ArenaAgentId, AgentFoyerState>>({
    0: defaultAgentState(0),
    1: defaultAgentState(1),
    2: defaultAgentState(2),
    3: defaultAgentState(3),
  });
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
    <div className="flex min-h-[calc(100dvh-9.5rem)] flex-col gap-5 xl:gap-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(7,8,16,0.96),rgba(10,18,34,0.9))] px-5 py-7 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(192,38,211,0.14),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.14),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.36em] text-cyan-200/70">Ink Mainnet // Mutation Floor</p>
          <div className="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <h1 className="font-display text-3xl uppercase tracking-[0.12em] text-white sm:text-4xl xl:text-[2.8rem]">
                Let The Loudest Token Survive.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72 sm:text-base">
                Ink tokens hit different when four evolving agents get involved. Every cycle they mutate, seize a new
                pick, and drag it toward the floor where only one signal gets to look strong.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-white/62">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">4 Agents</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Daily Mutation</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Fresh Ink Picks</span>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-3xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
          {error}
        </section>
      ) : null}

      <section className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {AGENTS.map((agent, index) => {
          const state = agentState[agent.agentId];
          const mutationStage = getMutationStage(state.mutationVersion);

          return (
            <article
              key={agent.agentId}
              className="arena-rise group relative h-[26rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,8,16,0.95),rgba(5,8,14,0.98))] shadow-[0_16px_50px_rgba(0,0,0,0.45)] xl:h-[28rem]"
              style={{
                animationDelay: `${index * 120}ms`,
                boxShadow: `0 18px 50px rgba(0,0,0,0.38), 0 0 0 1px rgba(255,255,255,0.04), 0 0 42px ${agent.aura}`,
              }}
            >
              <div className="absolute inset-0 overflow-hidden">
                <Image
                  src={agent.image}
                  alt={agent.name}
                  fill
                  priority
                  className="scale-[1.08] object-cover object-center opacity-20 blur-2xl transition duration-700 group-hover:scale-[1.12]"
                />
                <Image
                  src={agent.image}
                  alt=""
                  fill
                  priority
                  aria-hidden="true"
                  className="object-contain object-center px-2 pt-2 transition duration-700 group-hover:scale-[1.04]"
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(180deg, rgba(8,10,18,0.08) 0%, rgba(8,10,18,0.2) 28%, rgba(5,7,14,0.46) 58%, rgba(5,7,14,0.96) 100%), radial-gradient(circle at top, ${agent.aura}, transparent 44%)`,
                  }}
                />
              </div>

              <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
                <div>
                  <h2 className="font-display text-3xl uppercase tracking-[0.12em] text-white">{agent.name}</h2>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.24em] text-white/62">{agent.role}</p>
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

              <div className="absolute inset-x-0 bottom-0 z-10 p-4">
                <div className="rounded-[1.35rem] border border-white/10 bg-black/42 p-4 backdrop-blur-md">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">Held Today</p>
                      <p className="truncate font-display text-[1.9rem] uppercase tracking-[0.08em] text-white">
                        {state.token?.symbol ?? (loading ? "SYNCING" : "NO PICK")}
                      </p>
                    </div>
                    <div className="text-right font-mono text-[11px] uppercase tracking-[0.16em] text-white/56">
                      <p>{state.strategy}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px] text-white/84">
                    <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Stage</p>
                      <p>{mutationStage}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">Record</p>
                      <p>{state.wins}W / {state.losses}L</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-white/42">24h Move</p>
                      <p className={state.token && state.token.priceChange24h > 0 ? "text-emerald-300" : "text-red-300"}>
                        {state.token ? formatPercent(state.token.priceChange24h) : "--"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-white/58">
                    <span className="font-mono">BPM {state.dna.bpmRange}</span>
                    {state.token?.pairUrl ? (
                      <Link
                        href={state.token.pairUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="transition hover:text-white"
                      >
                        Market Trace
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 px-5 py-5 shadow-[0_16px_60px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.15),transparent_45%)]" />
        <div className="relative flex flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div>
            <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/70">Next Floor</p>
            <h3 className="mt-2 font-display text-2xl uppercase tracking-[0.12em] text-white">
              Battle Platform
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
              Picks are loaded. Step into the floor and let the crowd decide what actually hits.
            </p>
          </div>
          <Link
            href="/lobby/drift-hard"
            className="arena-pulse inline-flex self-center rounded-full border border-cyan-300/60 bg-cyan-300/18 px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100 transition hover:bg-cyan-300/28 sm:self-auto"
          >
            Enter Battle Platform
          </Link>
        </div>
      </section>
    </div>
  );
}
