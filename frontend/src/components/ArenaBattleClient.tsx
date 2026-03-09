"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWalletClient,
} from "wagmi";

import {
  arenaSidecarAbi,
  arenaSidecarAddress,
  claimArenaEpoch,
  isArenaSidecarConfigured,
  normalizeEpochPool,
  normalizeEpochResult,
  normalizeUserBet,
  placeArenaBet,
} from "@/lib/arenaSidecar";
import { renderPhonkClip } from "@/lib/audio/phonkSynth";
import type { ArenaAgentId, ArenaBattleAgentSnapshot, ArenaBattleSnapshot } from "@/lib/arenaTypes";
import { INK_MAINNET_CHAIN_ID } from "@/lib/inkChain";
import { ensureInkNetwork, readWalletChainId } from "@/lib/walletNetwork";

interface ArenaPresenceJoinResponse {
  sessionId: string;
  snapshot: ArenaBattleSnapshot;
}

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `arena_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const hours = Math.floor(safe / 3600);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatEth(value: bigint, fractionDigits = 4): string {
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return "0";
  }

  return asNumber.toFixed(asNumber >= 1 ? Math.min(fractionDigits, 3) : fractionDigits);
}

function shortTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function queueFrom(currentClipIndex: number): ArenaAgentId[] {
  return [0, 1, 2, 3].map((offset) => ((currentClipIndex + offset) % 4) as ArenaAgentId);
}

function agentColorVariable(agentId: ArenaAgentId): string {
  switch (agentId) {
    case 0:
      return "var(--rage)";
    case 1:
      return "var(--ghost)";
    case 2:
      return "var(--oracle)";
    default:
      return "var(--glitch)";
  }
}

function AgentNode({
  agent,
  isActive,
  isLeader,
}: {
  agent: ArenaBattleAgentSnapshot;
  isActive: boolean;
  isLeader: boolean;
}) {
  const positiveMove = agent.token.priceChange24h >= 0;

  return (
    <article
      className={`agent-card rounded-[1.8rem] p-4 ${isActive ? "z-10 scale-[1.035]" : "scale-[0.965] opacity-55"}`}
      style={
        {
          "--agent-color": agentColorVariable(agent.agentId),
          filter: isActive ? "saturate(1.22) brightness(1.15)" : "saturate(0.52) brightness(0.62)",
          boxShadow: isActive
            ? `0 24px 70px rgba(0,0,0,0.52), 0 0 0 1px rgba(255,255,255,0.08), 0 0 84px ${agent.aura}`
            : `0 16px 46px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)`,
        } as CSSProperties
      }
    >
      <div className="pointer-events-none absolute inset-0">
        <Image
          src={agent.image}
          alt={agent.name}
          fill
          className={`scale-[1.08] object-cover object-center ${isActive ? "opacity-28 blur-xl" : "opacity-10 blur-2xl"}`}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, rgba(6,8,16,0.18) 0%, rgba(5,7,14,0.5) 48%, rgba(5,7,14,0.96) 100%), radial-gradient(circle at top, ${agent.aura}, transparent 44%)`,
          }}
        />
        {!isActive ? <div className="absolute inset-0 bg-black/32" /> : null}
      </div>

      <div className="relative flex gap-4">
        <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/25">
          <Image
            src={agent.image}
            alt={agent.name}
            fill
            className={`object-cover object-top transition duration-300 ${isActive ? "scale-[1.03] opacity-100 saturate-125" : "opacity-78 saturate-[0.7]"}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="agent-name text-[2rem]">{agent.name}</h3>
              <p className="agent-role mt-1">{agent.role}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {isLeader ? (
                <span className="rounded-[2px] border border-[var(--oracle)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--oracle)]">
                  Crown Lead
                </span>
              ) : null}
              {isActive ? (
                <span className="live-badge shadow-[0_0_24px_color-mix(in_srgb,var(--agent-color)_35%,transparent)]">
                  Live Now
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="stat-label">Held Today</p>
              <p className="agent-name mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[1.45rem]">
                {agent.token.symbol}
              </p>
            </div>
            <div className="mono text-right text-[11px] uppercase tracking-[0.14em] text-white/62">
              <p>{agent.strategyLabel}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="data-chip rounded-[6px] px-3 py-2">
              <p className="stat-label">Battle Score</p>
              <p className="stat-value mt-1">{agent.score.total.toFixed(1)}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-2">
              <p className="stat-label">24h Move</p>
              <p className={`stat-value mt-1 ${positiveMove ? "positive" : "negative"}`}>
                {positiveMove ? "+" : ""}
                {agent.token.priceChange24h.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="progress-label">
              <span>Crown Pressure</span>
              <span className="progress-value">{agent.score.total.toFixed(0)} / 100</span>
            </div>
            <div className="progress-wrap mt-1">
              <div
                className="progress-fill"
                style={{ width: `${Math.max(8, Math.min(100, agent.score.total))}%` }}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-white/56">
            <span className="bpm mono">BPM {agent.dna.bpmRange}</span>
            {agent.token.pairUrl ? (
              <Link href={agent.token.pairUrl} target="_blank" rel="noreferrer" className="transition hover:text-white">
                Market Trace
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ArenaBattleClient() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [snapshot, setSnapshot] = useState<ArenaBattleSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [betAmount, setBetAmount] = useState("0.01");
  const [betBusy, setBetBusy] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [betTxHash, setBetTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const sessionIdRef = useRef<string>(makeSessionId());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedClipIdRef = useRef<string>("");
  const clipBufferCacheRef = useRef<Map<string, Promise<AudioBuffer>>>(new Map());
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentGainRef = useRef<GainNode | null>(null);

  const resolvedChainId = walletChainId ?? chainId;
  const wrongChain = isConnected && resolvedChainId !== INK_MAINNET_CHAIN_ID;

  const { data: sidecarCurrentEpochIdRaw, refetch: refetchSidecarCurrentEpochId } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "currentEpochId",
    query: {
      enabled: isArenaSidecarConfigured,
      refetchInterval: 5_000,
    },
  });

  const sidecarCurrentEpochId =
    typeof sidecarCurrentEpochIdRaw === "bigint"
      ? sidecarCurrentEpochIdRaw
      : BigInt(snapshot?.currentEpoch.epochId ?? 0);
  const sidecarPreviousEpochId = sidecarCurrentEpochId > 0n ? sidecarCurrentEpochId - 1n : null;

  const { data: currentEpochPoolRaw, refetch: refetchCurrentEpochPool } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "getEpochPool",
    args: [sidecarCurrentEpochId],
    query: {
      enabled: isArenaSidecarConfigured,
      refetchInterval: 5_000,
    },
  });

  const { data: currentEpochResultRaw, refetch: refetchCurrentEpochResult } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "getEpochResult",
    args: [sidecarCurrentEpochId],
    query: {
      enabled: isArenaSidecarConfigured,
      refetchInterval: 5_000,
    },
  });

  const { data: currentEpochEndRaw } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "epochEnd",
    args: [sidecarCurrentEpochId],
    query: {
      enabled: isArenaSidecarConfigured,
      refetchInterval: 5_000,
    },
  });

  const { data: currentEpochOpenRaw, refetch: refetchCurrentEpochOpen } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "isEpochOpen",
    args: [sidecarCurrentEpochId],
    query: {
      enabled: isArenaSidecarConfigured,
      refetchInterval: 5_000,
    },
  });

  const { data: currentUserBetRaw, refetch: refetchCurrentUserBet } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "getUserBet",
    args: address ? [sidecarCurrentEpochId, address] : undefined,
    query: {
      enabled: isArenaSidecarConfigured && Boolean(address),
      refetchInterval: 5_000,
    },
  });

  const { data: previousEpochResultRaw, refetch: refetchPreviousEpochResult } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "getEpochResult",
    args: sidecarPreviousEpochId !== null ? [sidecarPreviousEpochId] : undefined,
    query: {
      enabled: isArenaSidecarConfigured && sidecarPreviousEpochId !== null,
      refetchInterval: 5_000,
    },
  });

  const { data: previousUserBetRaw, refetch: refetchPreviousUserBet } = useReadContract({
    address: arenaSidecarAddress,
    abi: arenaSidecarAbi,
    functionName: "getUserBet",
    args: address && sidecarPreviousEpochId !== null ? [sidecarPreviousEpochId, address] : undefined,
    query: {
      enabled: isArenaSidecarConfigured && Boolean(address) && sidecarPreviousEpochId !== null,
      refetchInterval: 5_000,
    },
  });

  const { isLoading: betConfirming, isSuccess: betConfirmed } = useWaitForTransactionReceipt({
    hash: betTxHash,
    query: {
      enabled: Boolean(betTxHash),
    },
  });

  const { isLoading: claimConfirming, isSuccess: claimConfirmed, isError: claimFailed, error: claimReceiptError } =
    useWaitForTransactionReceipt({
      hash: claimTxHash,
      query: {
        enabled: Boolean(claimTxHash),
      },
    });

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch("/api/arena/state", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load arena state.");
    }

    const data = (await response.json()) as ArenaBattleSnapshot;
    setSnapshot(data);
  }, []);

  const joinPresence = useCallback(async () => {
    const response = await fetch("/api/arena/presence/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to join arena presence.");
    }

    const payload = (await response.json()) as ArenaPresenceJoinResponse;
    sessionIdRef.current = payload.sessionId;
    setSnapshot(payload.snapshot);
  }, []);

  const leavePresence = useCallback(async () => {
    await fetch("/api/arena/presence/leave", {
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

  useEffect(() => {
    let stopped = false;

    const boot = async () => {
      try {
        setLoading(true);
        await joinPresence();
        await fetchSnapshot();
        if (!stopped) {
          setError(null);
        }
      } catch (bootError) {
        if (!stopped) {
          setError(bootError instanceof Error ? bootError.message : "Failed to initialize arena.");
        }
      } finally {
        if (!stopped) {
          setLoading(false);
        }
      }
    };

    void boot();

    const statePoll = window.setInterval(() => {
      void fetchSnapshot().catch(() => undefined);
    }, 1_500);

    const heartbeat = window.setInterval(() => {
      void joinPresence().catch(() => undefined);
    }, 10_000);

    const clock = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    const handleUnload = () => {
      const payload = JSON.stringify({
        sessionId: sessionIdRef.current,
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/arena/presence/leave", new Blob([payload], { type: "application/json" }));
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      stopped = true;
      window.clearInterval(statePoll);
      window.clearInterval(heartbeat);
      window.clearInterval(clock);
      window.removeEventListener("beforeunload", handleUnload);
      void leavePresence();
    };
  }, [fetchSnapshot, joinPresence, leavePresence]);

  useEffect(() => {
    let cancelled = false;

    const syncChainId = async () => {
      if (!isConnected) {
        if (!cancelled) {
          setWalletChainId(null);
        }
        return;
      }

      const detected = await readWalletChainId(walletClient);
      if (!cancelled && detected !== null) {
        setWalletChainId(detected);
      }
    };

    void syncChainId();
    const interval = window.setInterval(() => {
      void syncChainId();
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isConnected, walletClient]);

  useEffect(() => {
    if (!betConfirmed) {
      return;
    }

    setBetBusy(false);
    void Promise.all([
      refetchSidecarCurrentEpochId(),
      refetchCurrentEpochPool(),
      refetchCurrentEpochResult(),
      refetchCurrentEpochOpen(),
      refetchCurrentUserBet(),
    ]);
  }, [
    betConfirmed,
    refetchCurrentEpochOpen,
    refetchCurrentEpochPool,
    refetchCurrentEpochResult,
    refetchCurrentUserBet,
    refetchSidecarCurrentEpochId,
  ]);

  useEffect(() => {
    if (!claimConfirmed) {
      return;
    }

    setClaimBusy(false);
    void Promise.all([
      refetchPreviousEpochResult(),
      refetchPreviousUserBet(),
      refetchCurrentEpochResult(),
      refetchCurrentEpochPool(),
    ]);
  }, [claimConfirmed, refetchCurrentEpochPool, refetchCurrentEpochResult, refetchPreviousEpochResult, refetchPreviousUserBet]);

  useEffect(() => {
    if (!claimFailed) {
      return;
    }

    setClaimBusy(false);
    setClaimError(claimReceiptError instanceof Error ? claimReceiptError.message : "Claim transaction failed.");
  }, [claimFailed, claimReceiptError]);

  const ensureClipBuffer = useCallback((battleSnapshot: ArenaBattleSnapshot, clipId: string) => {
    const cached = clipBufferCacheRef.current.get(clipId);
    if (cached) {
      return cached;
    }

    const clip = battleSnapshot.nowPlaying;
    if (!clip || clip.clipId !== clipId) {
      return null;
    }

    const promise = renderPhonkClip({
      seed: clip.seed,
      style: clip.style,
      intensity: clip.intensity,
      durationSec: clip.durationMs / 1000,
      bpm: clip.bpm,
      mutationLevel: clip.mutationLevel,
      patternDensity: clip.patternDensity,
      distortion: clip.distortion,
      fxChance: clip.fxChance,
      lobbyId: clip.renderLobbyId,
      agentId: clip.renderAgentId,
      strategy: clip.strategy,
      agentPersona: clip.agentPersona,
    }).catch((renderError) => {
      clipBufferCacheRef.current.delete(clipId);
      throw renderError;
    });

    clipBufferCacheRef.current.set(clipId, promise);
    return promise;
  }, []);

  const stopCurrentClip = useCallback((resetClipId = false) => {
    const currentSource = currentSourceRef.current;
    if (currentSource) {
      currentSource.onended = null;
      try {
        currentSource.stop();
      } catch {
        // Source may already be stopped.
      }
      try {
        currentSource.disconnect();
      } catch {
        // Ignore disconnect errors on released nodes.
      }
      currentSourceRef.current = null;
    }

    const currentGain = currentGainRef.current;
    if (currentGain) {
      try {
        currentGain.disconnect();
      } catch {
        // Ignore disconnect errors on released nodes.
      }
      currentGainRef.current = null;
    }

    if (resetClipId) {
      lastPlayedClipIdRef.current = "";
    }
  }, []);

  const enableAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }

    await audioCtxRef.current.resume();
    setAudioEnabled(true);
  }, []);

  useEffect(() => {
    return () => {
      stopCurrentClip(true);
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [stopCurrentClip]);

  useEffect(() => {
    if (audioEnabled) {
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }

    void audioCtxRef.current
      .resume()
      .then(() => {
        setAudioEnabled(true);
      })
      .catch(() => undefined);
  }, [audioEnabled]);

  useEffect(() => {
    if (!audioEnabled || !snapshot?.nowPlaying) {
      stopCurrentClip(true);
      return;
    }

    const clip = snapshot.nowPlaying;
    if (lastPlayedClipIdRef.current === clip.clipId) {
      return;
    }

    let cancelled = false;

    const renderAndPlay = async () => {
      try {
        const bufferPromise = ensureClipBuffer(snapshot, clip.clipId);
        if (!bufferPromise || !audioCtxRef.current) {
          return;
        }

        const buffer = await bufferPromise;
        if (cancelled || !audioCtxRef.current) {
          return;
        }

        const context = audioCtxRef.current;
        if (context.state === "suspended") {
          await context.resume();
        }

        stopCurrentClip(false);

        const source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = 0.95;

        source.buffer = buffer;
        source.connect(gain);
        gain.connect(context.destination);
        source.onended = () => {
          if (currentSourceRef.current === source) {
            currentSourceRef.current = null;
          }
          if (currentGainRef.current === gain) {
            try {
              gain.disconnect();
            } catch {
              // Ignore disconnect errors on released nodes.
            }
            currentGainRef.current = null;
          }
        };
        currentSourceRef.current = source;
        currentGainRef.current = gain;
        source.start();
        source.stop(context.currentTime + clip.durationMs / 1000);
        lastPlayedClipIdRef.current = clip.clipId;
      } catch {
        setUiMessage("Arena clip could not render. Check sample packs in /public/sounds.");
      }
    };

    void renderAndPlay();

    return () => {
      cancelled = true;
    };
  }, [audioEnabled, ensureClipBuffer, snapshot, stopCurrentClip]);

  const leaderboardAgents = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const byId = new Map(snapshot.agents.map((agent) => [agent.agentId, agent]));
    return snapshot.leaderboard.map((agentId) => byId.get(agentId)).filter(Boolean) as ArenaBattleAgentSnapshot[];
  }, [snapshot]);

  const currentEpochPool = useMemo(() => normalizeEpochPool(currentEpochPoolRaw), [currentEpochPoolRaw]);
  const currentEpochResult = useMemo(() => normalizeEpochResult(currentEpochResultRaw), [currentEpochResultRaw]);
  const currentUserBet = useMemo(() => normalizeUserBet(currentUserBetRaw), [currentUserBetRaw]);
  const previousEpochResult = useMemo(() => normalizeEpochResult(previousEpochResultRaw), [previousEpochResultRaw]);
  const previousUserBet = useMemo(() => normalizeUserBet(previousUserBetRaw), [previousUserBetRaw]);
  const currentEpochOpen = Boolean(currentEpochOpenRaw);
  const currentEpochEndTimestamp =
    typeof currentEpochEndRaw === "bigint" ? Number(currentEpochEndRaw) * 1000 : snapshot?.currentEpoch.endsAt ?? 0;

  let parsedBetWei: bigint | null = null;
  try {
    parsedBetWei = parseEther(betAmount.trim() || "0");
  } catch {
    parsedBetWei = null;
  }

  const hasValidBetAmount = parsedBetWei !== null && parsedBetWei > 0n;
  const currentBetAgentId = currentUserBet?.exists ? currentUserBet.agentId : null;
  const claimableEpochId =
    sidecarPreviousEpochId !== null &&
    previousEpochResult?.finalized &&
    previousUserBet?.exists &&
    !previousUserBet.claimed
      ? sidecarPreviousEpochId
      : null;

  const currentPlayingAgent =
    snapshot?.nowPlaying ? snapshot.agents.find((agent) => agent.agentId === snapshot.nowPlaying?.agentId) ?? null : null;
  const queue = snapshot ? queueFrom(snapshot.currentClipIndex) : [];
  const secondsLeft = snapshot?.nowPlaying ? Math.max(0, Math.ceil((snapshot.nowPlaying.endsAt - now) / 1000)) : 0;
  const epochSecondsLeft = currentEpochEndTimestamp ? Math.max(0, Math.floor((currentEpochEndTimestamp - now) / 1000)) : 0;
  const leftAgents = snapshot?.agents.filter((agent) => agent.agentId === 0 || agent.agentId === 1) ?? [];
  const rightAgents = snapshot?.agents.filter((agent) => agent.agentId === 2 || agent.agentId === 3) ?? [];

  const ensureWalletOnInk = useCallback(async () => {
    const detectedBefore = await readWalletChainId(walletClient);
    if (detectedBefore === INK_MAINNET_CHAIN_ID || resolvedChainId === INK_MAINNET_CHAIN_ID) {
      return;
    }

    try {
      await ensureInkNetwork(walletClient);
    } catch {
      if (switchChain) {
        switchChain({ chainId: INK_MAINNET_CHAIN_ID });
      }
      throw new Error("Switch wallet to Ink mainnet and retry.");
    }

    const detectedAfter = await readWalletChainId(walletClient);
    if (detectedAfter !== INK_MAINNET_CHAIN_ID) {
      throw new Error("Switch wallet to Ink mainnet and retry.");
    }

    setWalletChainId(detectedAfter);
  }, [resolvedChainId, switchChain, walletClient]);

  const submitBet = useCallback(
    async (agentId: ArenaAgentId) => {
      if (!walletClient || !address || !isArenaSidecarConfigured || !currentEpochOpen || !hasValidBetAmount || !parsedBetWei) {
        return;
      }

      if (currentBetAgentId !== null && currentBetAgentId !== agentId) {
        setBetError("This epoch already has a bet on another agent. Top up the same agent or wait for next epoch.");
        return;
      }

      setBetBusy(true);
      setBetError(null);

      try {
        await ensureWalletOnInk();
        const hash = await placeArenaBet(walletClient, sidecarCurrentEpochId, agentId, parsedBetWei);
        setBetTxHash(hash);
      } catch (betSubmitError) {
        setBetBusy(false);
        setBetError(betSubmitError instanceof Error ? betSubmitError.message : "Bet transaction failed.");
      }
    },
    [
      address,
      currentBetAgentId,
      currentEpochOpen,
      ensureWalletOnInk,
      hasValidBetAmount,
      parsedBetWei,
      sidecarCurrentEpochId,
      walletClient,
    ],
  );

  const submitClaim = useCallback(async () => {
    if (!walletClient || claimableEpochId === null || !address || !isArenaSidecarConfigured) {
      return;
    }

    setClaimBusy(true);
    setClaimError(null);

    try {
      await ensureWalletOnInk();
      const hash = await claimArenaEpoch(walletClient, claimableEpochId);
      setClaimTxHash(hash);
    } catch (claimSubmitError) {
      setClaimBusy(false);
      setClaimError(claimSubmitError instanceof Error ? claimSubmitError.message : "Claim transaction failed.");
    }
  }, [address, claimableEpochId, ensureWalletOnInk, walletClient]);

  if (loading && !snapshot) {
    return <p className="text-white/75">Loading battle platform...</p>;
  }

  if (error || !snapshot) {
    return <p className="text-red-300">{error ?? "Unable to load battle platform."}</p>;
  }

  return (
    <div className="space-y-5">
      <section className="panel-shell relative overflow-hidden rounded-[2rem] px-5 py-6 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.14),transparent_36%),radial-gradient(circle_at_80%_18%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_16%_88%,rgba(250,204,21,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="hero-eyebrow text-[11px] text-white/48">Battle Platform</p>
            <h1 className="section-title mt-2 text-white">
              Four Agents. One Crown.
            </h1>
            <p className="subtitle mt-3 max-w-3xl text-sm leading-6 text-white/72 sm:text-base">
              Crowd taste no longer decides the winner. The arena crowns whoever drives the strongest token signal on Ink:
              price first, then volume, then live market flow.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="feature-badge">Listeners {snapshot.listeners}</span>
            <span className="feature-badge">Epoch {snapshot.currentEpoch.epochId}</span>
            <span className="feature-badge">{snapshot.currentEpoch.scoringRule}</span>
          </div>
        </div>
      </section>

      {!audioEnabled ? (
        <button
          type="button"
          onClick={() => void enableAudio()}
          className="btn-enter inline-flex"
        >
          Enable Arena Audio
        </button>
      ) : (
        <p className="hero-eyebrow text-xs text-white/62">
          Arena audio unlocked. Each agent gets 10 seconds on the floor with a 2.5 second transition gap.
        </p>
      )}

      {wrongChain ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
          <p>Wallet is on the wrong network.</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Current chain: {resolvedChainId ?? "unknown"} | Required: {INK_MAINNET_CHAIN_ID}
          </p>
          <button
            type="button"
            onClick={() => {
              void ensureInkNetwork(walletClient).catch(() => {
                if (switchChain) {
                  switchChain({ chainId: INK_MAINNET_CHAIN_ID });
                }
              });
            }}
            disabled={isSwitching}
            className="mt-2 rounded-lg border border-amber-300/50 px-3 py-1.5 text-xs font-semibold"
          >
            {isSwitching ? "Switching..." : "Switch to Ink"}
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_1.18fr_1fr]">
        <div className="order-2 flex flex-col gap-4 xl:order-1">
          {leftAgents.map((agent) => (
            <AgentNode
              key={agent.agentId}
              agent={agent}
              isActive={snapshot.nowPlaying?.agentId === agent.agentId}
              isLeader={snapshot.currentEpoch.leaderAgentId === agent.agentId}
            />
          ))}
        </div>

        <div className="order-1 space-y-4 xl:order-2">
          <section className="panel-shell relative overflow-hidden rounded-[2rem] p-5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_44%)]" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hero-eyebrow text-[11px] text-white/48">Live Floor</p>
                  <h2
                    className="live-agent-name mt-2 text-[clamp(3rem,4.6vw,4.2rem)]"
                    style={
                      {
                        "--agent-color": currentPlayingAgent
                          ? agentColorVariable(currentPlayingAgent.agentId)
                          : "var(--text)",
                      } as CSSProperties
                    }
                  >
                    {currentPlayingAgent ? currentPlayingAgent.name : "Transition Gap"}
                  </h2>
                  <p className="subtitle mt-2 text-sm text-white/70">
                    {currentPlayingAgent
                      ? `${currentPlayingAgent.token.symbol} is on the speakers right now.`
                      : snapshot.status === "LIVE"
                        ? "Next agent is stepping in."
                        : "Arena is quiet until listeners return."}
                  </p>
                </div>

                <div className="grid gap-2 text-right">
                  <div className="data-chip rounded-[6px] px-3 py-2">
                    <p className="stat-label">Clip Timer</p>
                    <p className="timer mt-1 text-[2rem] text-white">{snapshot.nowPlaying ? `${secondsLeft}s` : "PAUSE"}</p>
                  </div>
                  <div className="data-chip rounded-[6px] px-3 py-2">
                    <p className="stat-label">Epoch Left</p>
                    <p className="timer mt-1 text-[2rem] text-white">{formatCountdown(epochSecondsLeft)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.4rem] border border-white/10 bg-black/28 p-4">
                  <p className="stat-label">Winner Logic</p>
                  <div className="mt-3 space-y-3 mono text-[11px] text-white/80">
                    <div>
                      <div className="progress-label mb-1" style={{ marginBottom: "6px" }}>
                        <span>Price Surge</span>
                        <span className="progress-value" style={{ ["--agent-color" as string]: "var(--rage)" } as CSSProperties}>55%</span>
                      </div>
                      <div className="progress-wrap">
                        <div
                          className="progress-fill after:content-none"
                          style={{ width: "55%", ["--agent-color" as string]: "var(--rage)" } as CSSProperties}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="progress-label mb-1" style={{ marginBottom: "6px" }}>
                        <span>Volume</span>
                        <span className="progress-value" style={{ ["--agent-color" as string]: "var(--ghost)" } as CSSProperties}>25%</span>
                      </div>
                      <div className="progress-wrap">
                        <div
                          className="progress-fill after:content-none"
                          style={{ width: "25%", ["--agent-color" as string]: "var(--ghost)" } as CSSProperties}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="progress-label mb-1" style={{ marginBottom: "6px" }}>
                        <span>Flow + Liquidity</span>
                        <span className="progress-value" style={{ ["--agent-color" as string]: "var(--oracle)" } as CSSProperties}>20%</span>
                      </div>
                      <div className="progress-wrap">
                        <div
                          className="progress-fill after:content-none"
                          style={{ width: "20%", ["--agent-color" as string]: "var(--oracle)" } as CSSProperties}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.4rem] border border-white/10 bg-black/28 p-4">
                  <p className="stat-label">Rotation Queue</p>
                  <div className="mt-3 grid gap-2">
                    {queue.map((agentId, index) => {
                      const agent = snapshot.agents.find((entry) => entry.agentId === agentId);
                      if (!agent) {
                        return null;
                      }

                      return (
                        <div
                          key={`${agentId}-${index}`}
                          className={`queue-row ${index === 0 ? "active text-white" : "text-white/72"}`}
                          style={{ ["--agent-color" as string]: agentColorVariable(agent.agentId) } as CSSProperties}
                        >
                          <span>{agent.name}</span>
                          <span className="mono text-[11px] uppercase tracking-[0.14em]">{agent.token.symbol}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[1.4rem] border border-cyan-300/16 bg-cyan-300/6 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="stat-label text-cyan-100/64">Live Board</p>
                    <h3 className="mt-2 agent-name text-[2.2rem]">
                      No Winner Is Locked Yet
                    </h3>
                    <p className="subtitle mt-2 max-w-2xl text-sm text-white/72">
                      The leaderboard is only a live read on token pressure. Scores can flip all epoch long. The winner is
                      fixed only after the epoch closes and the sidecar finalizes the result on-chain.
                    </p>
                  </div>
                  <div className="mono grid gap-2 text-right text-xs uppercase tracking-[0.14em] text-white/62">
                    <p>Board updates every few seconds</p>
                    <p>Clips rotate every 10 seconds</p>
                    <p>Payouts use finalized on-chain result</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="panel-shell rounded-[1.8rem] p-4">
              <h3 className="agent-name text-[1.8rem]">Leaderboard</h3>
              <div className="mt-4 space-y-3">
                {leaderboardAgents.map((agent, index) => (
                  <div
                    key={agent.agentId}
                    className="data-chip rounded-[6px] px-3 py-3"
                    style={{ ["--agent-color" as string]: agentColorVariable(agent.agentId) } as CSSProperties}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="agent-name text-[1.4rem]">
                          #{index + 1} {agent.name}
                        </p>
                        <p className="agent-role mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-white/54">
                          {agent.token.symbol} | {agent.strategyLabel}
                        </p>
                      </div>
                      <div className="mono text-right text-xs uppercase tracking-[0.14em] text-white/68">
                        <p className="text-[var(--agent-color)]">{agent.score.total.toFixed(1)}</p>
                        <p className="mt-1">{agent.token.volume24h.toFixed(0)} vol</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-shell rounded-[1.8rem] p-4">
              <h3 className="agent-name text-[1.8rem]">Arena Market</h3>
              {!isArenaSidecarConfigured ? (
                <>
                  <p className="subtitle mt-3 text-sm leading-6 text-white/68">
                    Sidecar ABI or address is missing. Add the deployed sidecar and this panel will switch to real 4-way
                    bets and claims.
                  </p>
                  <div className="data-chip mt-4 rounded-[1.4rem] p-4">
                    <p className="stat-label">Status</p>
                    <p className="agent-name mt-2 text-[1.4rem]">Sidecar Not Wired</p>
                  </div>
                </>
              ) : (
                <>
                  <p className="subtitle mt-3 text-sm leading-6 text-white/68">
                    Real ETH bets now settle through the arena sidecar. Winner still comes from token performance, not crowd
                    taste.
                  </p>

                  <div className="data-chip mt-4 rounded-[1.4rem] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="stat-label">Current Epoch Pool</p>
                      <p className="mono text-xs uppercase tracking-[0.14em] text-white/60">
                        Epoch {sidecarCurrentEpochId.toString()}
                      </p>
                    </div>
                    <p className="agent-name mt-2 text-[1.4rem]">
                      {currentEpochPool ? `${formatEth(currentEpochPool.totalPool)} ETH` : "Loading Pool"}
                    </p>
                    <p className="agent-role mt-2 text-xs text-white/54">
                      {currentEpochOpen ? "Open For Bets" : "Betting Closed"}
                    </p>
                    <p className="agent-role mt-1 text-xs text-white/44">
                      On-chain result:{" "}
                      {currentEpochResult?.finalized
                        ? currentEpochResult.winnerAgentId === 4
                          ? "Tie"
                          : snapshot.agents.find((agent) => agent.agentId === currentEpochResult.winnerAgentId)?.name ?? `Agent ${currentEpochResult.winnerAgentId}`
                        : "Pending Finalization"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <label htmlFor="arena-bet-amount" className="stat-label">
                      Bet Amount (ETH)
                    </label>
                    <input
                      id="arena-bet-amount"
                      type="number"
                      min="0"
                      step="0.001"
                      value={betAmount}
                      onChange={(event) => setBetAmount(event.target.value)}
                      className="mono rounded-[6px] border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-[var(--ghost)]"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {snapshot.agents.map((agent) => {
                      const hasOtherBet = currentBetAgentId !== null && currentBetAgentId !== agent.agentId;
                      const disabled =
                        !isConnected ||
                        wrongChain ||
                        !currentEpochOpen ||
                        !hasValidBetAmount ||
                        betBusy ||
                        betConfirming ||
                        hasOtherBet;

                      return (
                        <button
                          key={agent.agentId}
                          type="button"
                          onClick={() => void submitBet(agent.agentId)}
                          disabled={disabled}
                          className="btn-phonk disabled:cursor-not-allowed disabled:opacity-45"
                          style={{ ["--agent-color" as string]: agentColorVariable(agent.agentId) } as CSSProperties}
                        >
                          Bet {agent.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mono mt-4 space-y-2 text-xs text-white/76">
                    <p>
                      Your current epoch bet:{" "}
                      {currentUserBet?.exists ? `${formatEth(currentUserBet.amount)} ETH on ${snapshot.agents.find((agent) => agent.agentId === currentUserBet.agentId)?.name ?? `Agent ${currentUserBet.agentId}`}` : "No active bet"}
                    </p>
                    <p>
                      Pools:{" "}
                      {snapshot.agents
                        .map((agent, index) => `${agent.name} ${formatEth(currentEpochPool?.pools[index] ?? 0n)} ETH`)
                        .join(" | ")}
                    </p>
                    {betTxHash ? <p>Bet tx: {betTxHash}</p> : null}
                  </div>

                  {betBusy || betConfirming ? (
                    <p className="mt-3 text-xs text-white/72">
                      {betConfirming ? "Waiting for bet confirmation..." : "Submitting bet..."}
                    </p>
                  ) : null}
                  {betError ? <p className="mt-3 text-xs text-red-300">{betError}</p> : null}

                  <div className="data-chip mt-5 rounded-[1.4rem] p-4">
                    <p className="stat-label">Claim Rail</p>
                    <p className="mono mt-2 text-xs text-white/68">
                      Previous finalized epoch:{" "}
                      {sidecarPreviousEpochId !== null ? sidecarPreviousEpochId.toString() : "none"}
                    </p>
                    <p className="mono mt-1 text-xs text-white/68">
                      Previous result:{" "}
                      {previousEpochResult?.finalized
                        ? previousEpochResult.winnerAgentId === 4
                          ? "Tie"
                          : snapshot.agents.find((agent) => agent.agentId === previousEpochResult.winnerAgentId)?.name ?? `Agent ${previousEpochResult.winnerAgentId}`
                        : "Not finalized"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void submitClaim()}
                      disabled={claimableEpochId === null || claimBusy || claimConfirming || wrongChain || !isConnected}
                      className="btn-phonk mt-3 disabled:cursor-not-allowed disabled:opacity-45"
                      style={{ ["--agent-color" as string]: "var(--glitch)" } as CSSProperties}
                    >
                      {claimableEpochId ? `Claim Epoch ${claimableEpochId.toString()}` : "No Claim Available"}
                    </button>
                    {claimTxHash ? <p className="mono mt-2 text-xs text-white/76">Claim tx: {claimTxHash}</p> : null}
                    {claimBusy || claimConfirming ? (
                      <p className="mt-2 text-xs text-white/72">
                        {claimConfirming ? "Waiting for claim confirmation..." : "Submitting claim..."}
                      </p>
                    ) : null}
                    {claimError ? <p className="mt-2 text-xs text-red-300">{claimError}</p> : null}
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <div className="order-3 flex flex-col gap-4">
          {rightAgents.map((agent) => (
            <AgentNode
              key={agent.agentId}
              agent={agent}
              isActive={snapshot.nowPlaying?.agentId === agent.agentId}
              isLeader={snapshot.currentEpoch.leaderAgentId === agent.agentId}
            />
          ))}
        </div>
      </section>

      <section className="panel-shell rounded-[1.8rem] p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="stat-label">Recent Clips</p>
            <h3 className="agent-name mt-2 text-[1.8rem]">Arena History</h3>
          </div>
          <p className="agent-role text-xs text-white/50">
            {snapshot.status === "LIVE" ? `${snapshot.listeners} listeners in the room` : "Waiting for listeners"}
          </p>
        </div>

        {snapshot.clipHistory.length === 0 ? (
          <p className="mt-4 text-sm text-white/70">History builds after the first full rotation.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {snapshot.clipHistory.map((item) => (
              <li key={item.clipId} className="data-chip rounded-[6px] px-4 py-3 text-sm text-white/82">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="agent-name text-[1.2rem]">
                    {shortTime(item.startedAt)} | {item.agentPersona} | {item.tokenSymbol}
                  </p>
                  <p className="mono text-[11px] uppercase tracking-[0.14em] text-white/56">
                    score {item.liveScore.toFixed(1)} | bpm {item.bpm.toFixed(1)}
                  </p>
                </div>
                <p className="subtitle mt-2 text-xs leading-5 text-white/66">{item.note}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {uiMessage ? <p className="text-xs text-white/72">{uiMessage}</p> : null}
    </div>
  );
}
