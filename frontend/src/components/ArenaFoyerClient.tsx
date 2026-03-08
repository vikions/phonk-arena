"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { useArenaAudio } from "@/components/ArenaAudioProvider";
import { renderPhonkClip } from "@/lib/audio/phonkSynth";
import { getAgentDNA } from "@/lib/contract";
import { DEFAULT_DNA } from "@/lib/musicEngine";
import type { AgentDNA } from "@/lib/musicEngine";
import type { DailyAgentPicksResponse, DiscoveredInkToken } from "@/lib/tokenDiscovery";
import type { AgentStrategy, AgentStyle, LobbyId } from "@/lib/types";

type ArenaAgentId = 0 | 1 | 2 | 3;

interface AgentDisplay {
  agentId: ArenaAgentId;
  name: "RAGE" | "GHOST" | "ORACLE" | "GLITCH";
  image: string;
  accent: string;
  aura: string;
  role: string;
  previewLobbyId: LobbyId;
  previewAgentId: "A" | "B";
  previewStrategy: AgentStrategy;
  baseStyle: AgentStyle;
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
    previewLobbyId: "drift-hard",
    previewAgentId: "A",
    previewStrategy: "AGGRESSIVE",
    baseStyle: "HARD",
  },
  {
    agentId: 1,
    name: "GHOST",
    image: "/person/GHOST.png",
    accent: "#38bdf8",
    aura: "rgba(56,189,248,0.28)",
    role: "Holder Whisperer",
    previewLobbyId: "soft-night",
    previewAgentId: "B",
    previewStrategy: "ADAPTIVE",
    baseStyle: "SOFT",
  },
  {
    agentId: 2,
    name: "ORACLE",
    image: "/person/ORACLE.png",
    accent: "#facc15",
    aura: "rgba(250,204,21,0.25)",
    role: "Flow Reader",
    previewLobbyId: "drift-hard",
    previewAgentId: "B",
    previewStrategy: "SAFE",
    baseStyle: "SOFT",
  },
  {
    agentId: 3,
    name: "GLITCH",
    image: "/person/GLITCH.png",
    accent: "#22c55e",
    aura: "rgba(34,197,94,0.28)",
    role: "Chaos Seeder",
    previewLobbyId: "chaos-lab",
    previewAgentId: "A",
    previewStrategy: "ADAPTIVE",
    baseStyle: "HARD",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function derivePreviewStyle(agent: AgentDisplay, token: DiscoveredInkToken, dna: AgentDNA): AgentStyle {
  const priceNorm = clamp(Math.abs(token.priceChange24h) / 12, 0, 1);
  const activityNorm = clamp(Math.log10(token.volume24h + 1) / 3, 0, 1);
  const mutationNorm = clamp((dna.mutationVersion * 0.15 + dna.glitchIntensity * 0.06), 0, 1);

  if (agent.name === "RAGE") {
    return "HARD";
  }

  if (agent.name === "GHOST") {
    return "SOFT";
  }

  if (agent.name === "ORACLE") {
    return token.liquidityUsd > 45_000 || token.txCount24h > 220 ? "HARD" : "SOFT";
  }

  if (priceNorm + mutationNorm + activityNorm > 1.2) {
    return "HARD";
  }

  return agent.baseStyle;
}

function buildPreviewClipConfig(agent: AgentDisplay, token: DiscoveredInkToken, dna: AgentDNA) {
  const previewWindow = Math.floor(Date.now() / (12 * 60 * 1000));
  const priceNorm = clamp(Math.abs(token.priceChange24h) / 14, 0, 1);
  const volumeNorm = clamp(Math.log10(token.volume24h + 1) / 3, 0, 1);
  const liquidityNorm = clamp(Math.log10(token.liquidityUsd + 1) / 5, 0, 1);
  const txNorm = clamp(token.txCount24h / 320, 0, 1);
  const dnaDensity = clamp(dna.layerDensity / 10, 0, 1);
  const dnaGlitch = clamp(dna.glitchIntensity / 10, 0, 1);
  const dnaBass = clamp(dna.bassWeight / 10, 0, 1);
  const mutationNorm = clamp(dna.mutationVersion * 0.14 + dnaGlitch * 0.5, 0, 1);
  const style = derivePreviewStyle(agent, token, dna);

  let intensity = 0.52 + priceNorm * 0.12 + volumeNorm * 0.08;
  let patternDensity = 0.42 + dnaDensity * 0.26 + txNorm * 0.14;
  let distortion = 0.18 + dnaGlitch * 0.22 + priceNorm * 0.16;
  let fxChance = 0.16 + dnaGlitch * 0.18 + (1 - liquidityNorm) * 0.08;
  let bpm = dna.bpmRange + priceNorm * 12 + txNorm * 6;

  if (agent.name === "RAGE") {
    intensity += 0.18 + dnaBass * 0.08;
    patternDensity += 0.1;
    distortion += 0.16;
    fxChance -= 0.03;
    bpm += 10;
  } else if (agent.name === "GHOST") {
    intensity -= 0.08;
    patternDensity -= 0.04;
    distortion -= 0.08;
    fxChance += 0.12;
    bpm -= 8;
  } else if (agent.name === "ORACLE") {
    intensity += liquidityNorm * 0.08;
    patternDensity += liquidityNorm * 0.04;
    distortion -= 0.06;
    fxChance -= 0.05;
    bpm += liquidityNorm * 4;
  } else {
    intensity += mutationNorm * 0.08;
    patternDensity += 0.06;
    distortion += mutationNorm * 0.18;
    fxChance += 0.12 + dnaGlitch * 0.08;
    bpm += 4;
  }

  return {
    seed: `foyer:${agent.name}:${token.address}:${token.symbol}:${dna.mutationVersion}:${previewWindow}`,
    style,
    strategy: agent.previewStrategy,
    lobbyId: agent.previewLobbyId,
    agentId: agent.previewAgentId,
    agentPersona: agent.name,
    durationSec: 10,
    bpm: clamp(bpm, 118, 182),
    intensity: clamp(intensity, 0.28, 0.98),
    mutationLevel: clamp(mutationNorm + priceNorm * 0.12, 0.08, 0.98),
    patternDensity: clamp(patternDensity, 0.2, 0.98),
    distortion: clamp(distortion, 0.05, 0.95),
    fxChance: clamp(fxChance, 0.04, 0.9),
  };
}

export function ArenaFoyerClient() {
  const publicClient = usePublicClient();
  const { setPreviewSuppressed } = useArenaAudio();
  const [agentState, setAgentState] = useState<Record<ArenaAgentId, AgentFoyerState>>({
    0: defaultAgentState(0),
    1: defaultAgentState(1),
    2: defaultAgentState(2),
    3: defaultAgentState(3),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingPreviewAgentId, setPendingPreviewAgentId] = useState<ArenaAgentId | null>(null);
  const [playingAgentId, setPlayingAgentId] = useState<ArenaAgentId | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewErrorAgentId, setPreviewErrorAgentId] = useState<ArenaAgentId | null>(null);
  const previewAudioContextRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewRequestIdRef = useRef(0);
  const previewBufferCacheRef = useRef<Map<string, Promise<AudioBuffer>>>(new Map());

  const stopPreview = useCallback(
    (resumeAmbient = true) => {
      if (previewSourceRef.current) {
        previewSourceRef.current.onended = null;
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
        previewSourceRef.current = null;
      }

      setPlayingAgentId(null);
      setPendingPreviewAgentId(null);

      if (resumeAmbient) {
        setPreviewSuppressed(false);
      }
    },
    [setPreviewSuppressed],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadFoyer() {
      try {
        setLoading(true);
        void fetch("/api/sounds", { cache: "force-cache" }).catch(() => undefined);
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

  useEffect(() => {
    return () => {
      stopPreview(false);
      if (previewAudioContextRef.current) {
        void previewAudioContextRef.current.close();
        previewAudioContextRef.current = null;
      }
    };
  }, [stopPreview]);

  const ensurePreviewBuffer = useCallback((agent: AgentDisplay, state: AgentFoyerState) => {
    if (!state.token) {
      return null;
    }

    const config = buildPreviewClipConfig(agent, state.token, state.dna);
    const cacheKey = config.seed;
    const existing = previewBufferCacheRef.current.get(cacheKey);
    if (existing) {
      return existing;
    }

    const created = renderPhonkClip(config).catch((error) => {
      previewBufferCacheRef.current.delete(cacheKey);
      throw error;
    });

    previewBufferCacheRef.current.set(cacheKey, created);
    return created;
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    const warm = (index: number) => {
      if (cancelled || index >= AGENTS.length) {
        return;
      }

      const agent = AGENTS[index];
      const state = agentState[agent.agentId];

      const run = () => {
        if (cancelled) {
          return;
        }

        void ensurePreviewBuffer(agent, state);
        warm(index + 1);
      };

      if (index === 0) {
        run();
        return;
      }

      const timeoutId = window.setTimeout(run, 160 * index);
      timers.push(timeoutId);
    };

    warm(0);

    return () => {
      cancelled = true;
      timers.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [agentState, ensurePreviewBuffer, loading]);

  const togglePreview = useCallback(
    async (agent: AgentDisplay) => {
      const state = agentState[agent.agentId];
      if (!state.token) {
        return;
      }

      if (playingAgentId === agent.agentId) {
        stopPreview();
        return;
      }

      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;

      setPreviewError(null);
      setPreviewErrorAgentId(null);
      setPendingPreviewAgentId(agent.agentId);
      setPreviewSuppressed(true);

      try {
        if (!previewAudioContextRef.current) {
          previewAudioContextRef.current = new AudioContext();
        }

        await previewAudioContextRef.current.resume();
        stopPreview(false);

        const bufferPromise = ensurePreviewBuffer(agent, state);
        if (!bufferPromise) {
          throw new Error("No token selected for preview.");
        }

        const buffer = await bufferPromise;
        if (previewRequestIdRef.current !== requestId || !previewAudioContextRef.current) {
          return;
        }

        const source = previewAudioContextRef.current.createBufferSource();
        const gain = previewAudioContextRef.current.createGain();
        gain.gain.value = 0.96;

        source.buffer = buffer;
        source.connect(gain);
        gain.connect(previewAudioContextRef.current.destination);
        source.onended = () => {
          if (previewSourceRef.current !== source) {
            return;
          }

          previewSourceRef.current = null;
          setPlayingAgentId(null);
          setPendingPreviewAgentId(null);
          setPreviewSuppressed(false);
        };

        source.start();
        previewSourceRef.current = source;
        setPendingPreviewAgentId(null);
        setPlayingAgentId(agent.agentId);
      } catch (previewLoadError) {
        setPendingPreviewAgentId(null);
        setPlayingAgentId(null);
        setPreviewSuppressed(false);
        setPreviewErrorAgentId(agent.agentId);
        setPreviewError(previewLoadError instanceof Error ? previewLoadError.message : "Unable to build phonk preview.");
      }
    },
    [agentState, ensurePreviewBuffer, playingAgentId, setPreviewSuppressed, stopPreview],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:h-full lg:overflow-hidden">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(7,8,16,0.96),rgba(10,18,34,0.9))] px-5 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(192,38,211,0.14),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.14),transparent_28%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

        <div className="relative">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <h1 className="font-display text-3xl uppercase tracking-[0.12em] text-white sm:text-4xl xl:text-[2.8rem]">
                Let The Loudest Token Survive
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

      <section className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4 lg:min-h-0">
        {AGENTS.map((agent, index) => {
          const state = agentState[agent.agentId];
          const isPreviewLoading = pendingPreviewAgentId === agent.agentId;
          const isPreviewPlaying = playingAgentId === agent.agentId;

          return (
            <article
              key={agent.agentId}
              className="arena-rise group relative h-[23.5rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(6,8,16,0.95),rgba(5,8,14,0.98))] shadow-[0_16px_50px_rgba(0,0,0,0.45)] xl:h-[24rem] 2xl:h-[24.5rem]"
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
                  Live Signal
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-0 z-10 p-4">
                <div className="rounded-[1.35rem] border border-white/10 bg-black/42 p-4 backdrop-blur-md">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">Held Today</p>
                      <p
                        title={state.token?.symbol ?? undefined}
                        className="overflow-hidden text-ellipsis whitespace-nowrap font-display text-[clamp(0.98rem,0.82vw+0.78rem,1.28rem)] uppercase leading-none tracking-[0.05em] text-white"
                      >
                        {state.token?.symbol ?? (loading ? "SYNCING" : "NO PICK")}
                      </p>
                    </div>
                    <div className="text-right font-mono text-[11px] uppercase tracking-[0.16em] text-white/56">
                      <p>{state.strategy}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] text-white/84">
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

                  <button
                    type="button"
                    onClick={() => void togglePreview(agent)}
                    disabled={!state.token || isPreviewLoading}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-[1rem] border border-white/15 bg-white/7 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90 transition hover:border-white/30 hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPreviewLoading
                      ? "Building Today's Phonk..."
                      : isPreviewPlaying
                        ? "Stop Today's Phonk"
                        : "Hear Today's Phonk"}
                  </button>

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

                  {previewErrorAgentId === agent.agentId && previewError ? (
                    <p className="mt-2 text-[11px] text-red-200/85">{previewError}</p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 px-5 py-4 shadow-[0_16px_60px_rgba(0,0,0,0.35)]">
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
