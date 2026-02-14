"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { renderPhonkClip } from "@/lib/audio/phonkSynth";
import { MONAD_MAINNET_CHAIN_ID } from "@/lib/monadChain";
import type { AgentId, MatchSnapshot } from "@/lib/types";

interface LobbyBattleClientProps {
  lobbyId: string;
}

interface PresenceJoinResponse {
  sessionId: string;
  snapshot: MatchSnapshot;
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `session_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function shortTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function phaseTitle(phase: MatchSnapshot["phase"]): string {
  switch (phase) {
    case "A_PLAYING":
      return "Now playing Agent A";
    case "B_PLAYING":
      return "Now playing Agent B";
    default:
      return "Lobby idle";
  }
}

export function LobbyBattleClient({ lobbyId }: LobbyBattleClientProps) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedClipIdRef = useRef<string>("");
  const sessionIdRef = useRef<string>(makeSessionId());

  const wrongChain = isConnected && chainId !== MONAD_MAINNET_CHAIN_ID;

  const joinPresence = useCallback(async () => {
    const response = await fetch("/api/presence/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to join lobby presence.");
    }

    const payload = (await response.json()) as PresenceJoinResponse;
    sessionIdRef.current = payload.sessionId;

    if (payload.snapshot) {
      setMatch(payload.snapshot);
    }
  }, []);

  const leavePresence = useCallback(async () => {
    await fetch("/api/presence/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const fetchMatch = useCallback(async () => {
    const response = await fetch("/api/match", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load lobby state.");
    }

    const data = (await response.json()) as MatchSnapshot;
    setMatch(data);
  }, []);

  useEffect(() => {
    let stopped = false;

    const boot = async () => {
      try {
        setLoading(true);
        await joinPresence();
        await fetchMatch();

        if (!stopped) {
          setError(null);
        }
      } catch (bootError) {
        if (!stopped) {
          setError(bootError instanceof Error ? bootError.message : "Failed to initialize lobby.");
        }
      } finally {
        if (!stopped) {
          setLoading(false);
        }
      }
    };

    void boot();

    const matchPoll = setInterval(() => {
      void fetchMatch();
    }, 1_000);

    const heartbeat = setInterval(() => {
      void joinPresence();
    }, 10_000);

    const clock = setInterval(() => {
      setNow(Date.now());
    }, 250);

    const handleUnload = () => {
      const payload = JSON.stringify({ sessionId: sessionIdRef.current });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/presence/leave", new Blob([payload], { type: "application/json" }));
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      stopped = true;
      clearInterval(matchPoll);
      clearInterval(heartbeat);
      clearInterval(clock);
      window.removeEventListener("beforeunload", handleUnload);
      void leavePresence();
    };
  }, [fetchMatch, joinPresence, leavePresence]);

  async function enableAudio() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }

    await audioCtxRef.current.resume();
    setAudioEnabled(true);
  }

  useEffect(() => {
    if (!audioEnabled || !match?.nowPlaying) {
      return;
    }

    const clip = match.nowPlaying;

    if (lastPlayedClipIdRef.current === clip.clipId) {
      return;
    }

    lastPlayedClipIdRef.current = clip.clipId;

    const agent = match.agents.find((item) => item.id === clip.agentId);
    if (!agent) {
      return;
    }

    let cancelled = false;

    const renderAndPlay = async () => {
      try {
        const buffer = await renderPhonkClip({
          seed: clip.seed,
          style: clip.style,
          intensity: clip.intensity,
          durationSec: 10,
        });

        if (cancelled || !audioCtxRef.current) {
          return;
        }

        const context = audioCtxRef.current;
        if (context.state === "suspended") {
          await context.resume();
        }

        const source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = 0.9;

        source.buffer = buffer;
        source.connect(gain);
        gain.connect(context.destination);
        source.start();
      } catch {
        setUiMessage("Audio synthesis skipped for this clip.");
      }
    };

    void renderAndPlay();

    return () => {
      cancelled = true;
    };
  }, [audioEnabled, match]);

  const clipTimeLeft = useMemo(() => {
    if (!match?.nowPlaying) {
      return null;
    }

    return Math.max(0, Math.ceil((match.nowPlaying.endsAt - now) / 1000));
  }, [match?.nowPlaying, now]);

  const activeAgentId: AgentId | null = match?.nowPlaying?.agentId ?? null;

  if (loading && !match) {
    return <p className="text-white/80">Joining lobby {lobbyId}...</p>;
  }

  if (error || !match) {
    return <p className="text-red-300">{error ?? "Unable to load lobby."}</p>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/15 bg-black/35 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Lobby {match.lobbyId}</p>
            <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">
              {phaseTitle(match.phase)}
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-2 text-right text-sm">
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2">
              <p className="text-xs text-cyan-100/70">Status</p>
              <p className="font-display text-cyan-100">{match.status}</p>
            </div>
            <div className="rounded-xl border border-red-300/30 bg-red-400/10 px-3 py-2">
              <p className="text-xs text-red-100/70">Clip Timer</p>
              <p className="font-display text-red-100">{clipTimeLeft ?? "-"}s</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/75">
          <span className="rounded-full border border-white/20 px-3 py-1">Listeners: {match.listeners}</span>
          <span className="rounded-full border border-white/20 px-3 py-1">
            Total clips played: {match.totalClipsPlayed}
          </span>
          <span className="rounded-full border border-white/20 px-3 py-1">Match ID: {match.matchId}</span>
        </div>
      </section>

      {!audioEnabled ? (
        <button
          type="button"
          onClick={enableAudio}
          className="rounded-xl border border-cyan-300/60 bg-cyan-300/20 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/30"
        >
          Enable Audio
        </button>
      ) : (
        <p className="text-xs text-cyan-200/80">Audio unlocked. New clips autoplay every 10 seconds.</p>
      )}

      {wrongChain ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
          <p>Wallet is on the wrong network.</p>
          <button
            type="button"
            onClick={() => switchChain({ chainId: MONAD_MAINNET_CHAIN_ID })}
            disabled={isSwitching}
            className="mt-2 rounded-lg border border-amber-300/50 px-3 py-1.5 text-xs font-semibold"
          >
            {isSwitching ? "Switching..." : "Switch to Monad"}
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.65fr,1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {match.agents.map((agent) => {
              const isActive = activeAgentId === agent.id;

              return (
                <article
                  key={agent.id}
                  className={`rounded-2xl border bg-arena-900/65 p-4 transition ${
                    agent.id === "A" ? "border-cyan-300/35" : "border-red-300/35"
                  } ${isActive ? (agent.id === "A" ? "shadow-neon" : "shadow-blood") : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display text-xl uppercase tracking-[0.1em] text-white">
                      Agent {agent.id}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        agent.currentStyle === "HARD"
                          ? "bg-red-400/25 text-red-100"
                          : "bg-cyan-400/25 text-cyan-100"
                      }`}
                    >
                      {agent.currentStyle}
                    </span>
                  </div>

                  <p className="mt-2 text-sm font-semibold text-white/95">{agent.personaName}</p>
                  <p className="mt-1 text-xs text-white/65">Strategy: {agent.strategy}</p>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span>Confidence</span>
                      <span>{(agent.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-white/10">
                      <div
                        className={`h-full ${agent.id === "A" ? "bg-cyan-300/80" : "bg-red-300/80"}`}
                        style={{ width: `${Math.round(agent.confidence * 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-white/70">
                    Intensity: {(agent.intensity * 100).toFixed(0)}%
                  </p>
                  <p className="mt-1 text-xs text-white/70">Clips: {agent.clipsPlayed}</p>
                  <p className="mt-1 text-xs text-white/70">
                    W/L: {agent.wins}/{agent.losses}
                  </p>

                  {isActive ? (
                    <div className="mt-3 flex items-end gap-1.5">
                      {Array.from({ length: 12 }).map((_, index) => (
                        <span
                          key={`${agent.id}-bar-${index}`}
                          className={`inline-block w-1 rounded bg-current opacity-85 ${
                            agent.id === "A" ? "text-cyan-100" : "text-red-100"
                          } animate-pulseSlow`}
                          style={{
                            height: `${10 + (index % 5) * 4}px`,
                            animationDelay: `${index * 0.08}s`,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h2 className="font-display text-lg uppercase tracking-[0.1em] text-white">Live Clip History</h2>
            <p className="mt-1 text-xs text-white/70">Last 10 clips from the continuous agent loop.</p>

            {match.clipHistory.length === 0 ? (
              <p className="mt-3 text-sm text-white/70">History appears after first completed clip.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {match.clipHistory.map((item) => (
                  <li
                    key={item.clipId}
                    className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs text-white/85"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p>
                        {shortTime(item.startedAt)} - Agent {item.agentId} - {item.style}
                      </p>
                      <p>
                        score {item.judgeScore} - {item.outcome}
                      </p>
                    </div>
                    <p className="mt-1 text-white/65">{item.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h3 className="font-display text-lg uppercase tracking-[0.1em] text-white">Now Playing</h3>
            {match.nowPlaying ? (
              <div className="mt-2 space-y-1 text-sm text-white/85">
                <p>Agent: {match.nowPlaying.agentId}</p>
                <p>Style: {match.nowPlaying.style}</p>
                <p>Strategy: {match.nowPlaying.strategy}</p>
                <p>Confidence: {(match.nowPlaying.confidence * 100).toFixed(0)}%</p>
                <p>Intensity: {(match.nowPlaying.intensity * 100).toFixed(0)}%</p>
                <p>Seed: {match.nowPlaying.seed}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/70">Lobby is idle. Waiting for listeners.</p>
            )}
          </section>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h3 className="font-display text-lg uppercase tracking-[0.1em] text-white">Future Controls</h3>
            <p className="mt-2 text-xs text-white/70">
              Voting and manual mutations can be added later without changing the live loop core.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled
                className="rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100/60"
              >
                Vote Agent A
              </button>
              <button
                type="button"
                disabled
                className="rounded-xl border border-red-300/30 bg-red-300/10 px-3 py-2 text-xs font-semibold text-red-100/60"
              >
                Vote Agent B
              </button>
            </div>
          </section>

          {uiMessage ? <p className="text-xs text-white/80">{uiMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}