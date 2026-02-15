"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWalletClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { renderPhonkClip } from "@/lib/audio/phonkSynth";
import {
  betSideToContractSide,
  epochArenaAbi,
  epochArenaAddress,
  getCurrentEpochId,
  getEpochEndTimestampSec,
  lobbyIdToBytes32,
  voteSideToContractSide,
} from "@/lib/contract";
import { MONAD_MAINNET_CHAIN_ID } from "@/lib/monadChain";
import { ensureMonadNetwork, readWalletChainId } from "@/lib/walletNetwork";
import type { LobbyId, MatchSnapshot, VoteSide } from "@/lib/types";

interface LobbyBattleClientProps {
  lobbyId: LobbyId;
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

function phaseTitle(phase: MatchSnapshot["phase"], status: MatchSnapshot["status"]): string {
  switch (phase) {
    case "A_PLAYING":
      return "Now playing Agent A";
    case "B_PLAYING":
      return "Now playing Agent B";
    default:
      return status === "LIVE" ? "Transition pause" : "Lobby idle";
  }
}

function parseTally(data: unknown): { aVotes: number; bVotes: number } | null {
  if (!data) {
    return null;
  }

  if (Array.isArray(data) && data.length >= 2) {
    return {
      aVotes: Number(data[0]),
      bVotes: Number(data[1]),
    };
  }

  if (typeof data === "object" && data !== null) {
    const maybe = data as { aVotes?: bigint | number; bVotes?: bigint | number };
    if (typeof maybe.aVotes !== "undefined" && typeof maybe.bVotes !== "undefined") {
      return {
        aVotes: Number(maybe.aVotes),
        bVotes: Number(maybe.bVotes),
      };
    }
  }

  return null;
}

function formatMon(wei: string, maxFraction = 4): string {
  try {
    const value = Number(formatEther(BigInt(wei)));
    if (!Number.isFinite(value)) {
      return "0";
    }
    return value.toFixed(Math.min(maxFraction, value >= 1 ? 3 : 4));
  } catch {
    return "0";
  }
}

function sumWei(a: string, b: string): string {
  try {
    return (BigInt(a) + BigInt(b)).toString();
  } catch {
    return "0";
  }
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;
}

export function LobbyBattleClient({ lobbyId }: LobbyBattleClientProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();

  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uiMessage, setUiMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteTxHash, setVoteTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [betAmount, setBetAmount] = useState("0.05");
  const [betBusy, setBetBusy] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [betTxHash, setBetTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [pendingClaimEpochId, setPendingClaimEpochId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedClipIdRef = useRef<string>("");
  const sessionIdRef = useRef<string>(makeSessionId());

  const resolvedChainId = walletChainId ?? chainId;
  const wrongChain = isConnected && resolvedChainId !== MONAD_MAINNET_CHAIN_ID;
  const lobbyIdBytes32 = useMemo(() => lobbyIdToBytes32(lobbyId), [lobbyId]);
  const currentEpochId = useMemo(() => getCurrentEpochId(now), [now]);
  const epochEnd = useMemo(() => getEpochEndTimestampSec(now), [now]);
  const epochSecondsLeft = Math.max(0, epochEnd - Math.floor(now / 1000));
  const epochEnded = epochSecondsLeft <= 0;
  const epochCountdown = useMemo(() => formatCountdown(epochSecondsLeft), [epochSecondsLeft]);

  const { data: onchainTallyRaw, refetch: refetchOnchainTally } = useReadContract({
    address: epochArenaAddress,
    abi: epochArenaAbi,
    functionName: "getTally",
    args: [lobbyIdBytes32, currentEpochId],
    query: {
      refetchInterval: 5_000,
    },
  });

  const { data: hasVotedRaw, refetch: refetchHasVoted } = useReadContract({
    address: epochArenaAddress,
    abi: epochArenaAbi,
    functionName: "hasVoted",
    args: address ? [lobbyIdBytes32, currentEpochId, address] : undefined,
    query: {
      enabled: Boolean(address),
      refetchInterval: 5_000,
    },
  });

  const { isLoading: voteConfirming } = useWaitForTransactionReceipt({
    hash: voteTxHash,
    query: {
      enabled: Boolean(voteTxHash),
    },
  });

  const { isLoading: betConfirming } = useWaitForTransactionReceipt({
    hash: betTxHash,
    query: {
      enabled: Boolean(betTxHash),
    },
  });

  const {
    isLoading: claimConfirming,
    isSuccess: claimConfirmed,
    isError: claimFailed,
    error: claimReceiptError,
  } = useWaitForTransactionReceipt({
    hash: claimTxHash,
    query: {
      enabled: Boolean(claimTxHash),
    },
  });

  const onchainTally = useMemo(() => parseTally(onchainTallyRaw), [onchainTallyRaw]);
  const hasVotedOnchain = Boolean(hasVotedRaw);

  const joinPresence = useCallback(async () => {
    const response = await fetch("/api/presence/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lobbyId,
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
  }, [lobbyId]);

  const leavePresence = useCallback(async () => {
    await fetch("/api/presence/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        lobbyId,
        sessionId: sessionIdRef.current,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [lobbyId]);

  const fetchMatch = useCallback(async () => {
    const query = new URLSearchParams({
      lobbyId,
    });
    if (address) {
      query.set("address", address);
    }

    const response = await fetch(`/api/match?${query.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to load lobby state.");
    }

    const data = (await response.json()) as MatchSnapshot;
    setMatch(data);
  }, [address, lobbyId]);

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
      const payload = JSON.stringify({
        lobbyId,
        sessionId: sessionIdRef.current,
      });
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
  }, [fetchMatch, joinPresence, leavePresence, lobbyId]);

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
    const interval = setInterval(() => {
      void syncChainId();
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isConnected, walletClient]);

  async function enableAudio() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }

    await audioCtxRef.current.resume();
    setAudioEnabled(true);
  }

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
      .catch(() => {
        // Browser blocked autoplay; user can unlock manually.
      });
  }, [audioEnabled]);

  useEffect(() => {
    if (!audioEnabled || !match?.nowPlaying) {
      return;
    }

    const clip = match.nowPlaying;
    const clipId = clip.clipId;
    if (lastPlayedClipIdRef.current === clipId) {
      return;
    }

    let cancelled = false;

    const renderAndPlay = async () => {
      try {
        const buffer = await renderPhonkClip({
          seed: `${lobbyId}:${clip.seed}`,
          style: clip.style,
          intensity: clip.intensity,
          durationSec: clip.durationMs / 1000,
          bpm: clip.bpm,
          mutationLevel: clip.mutationLevel,
          patternDensity: clip.patternDensity,
          distortion: clip.distortion,
          fxChance: clip.fxChance,
          lobbyId,
          agentId: clip.agentId,
          strategy: clip.strategy,
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
        gain.gain.value = 0.92;

        source.buffer = buffer;
        source.connect(gain);
        gain.connect(context.destination);
        source.start();
        lastPlayedClipIdRef.current = clipId;
      } catch {
        setUiMessage("Sample pack not available for this clip. Add files to /public/sounds.");
      }
    };

    void renderAndPlay();

    return () => {
      cancelled = true;
    };
  }, [
    audioEnabled,
    lobbyId,
    match?.nowPlaying?.clipId,
    match?.nowPlaying?.seed,
    match?.nowPlaying?.style,
    match?.nowPlaying?.strategy,
    match?.nowPlaying?.agentId,
  ]);

  const clipTimeLeft = useMemo(() => {
    if (!match?.nowPlaying) {
      return null;
    }

    return Math.max(0, Math.ceil((match.nowPlaying.endsAt - now) / 1000));
  }, [match?.nowPlaying, now]);

  const currentEpochIdNumber = match?.currentEpoch.epochId ?? Number(currentEpochId);
  let parsedBetWei: bigint | null = null;
  try {
    parsedBetWei = parseEther(betAmount.trim() || "0");
  } catch {
    parsedBetWei = null;
  }

  const hasValidBetAmount = parsedBetWei !== null && parsedBetWei > 0n;
  const canVote =
    Boolean(match?.nowPlaying) &&
    Boolean(address) &&
    !epochEnded &&
    !hasVotedOnchain &&
    !voteBusy &&
    !voteConfirming;
  const canBet =
    Boolean(address) &&
    !epochEnded &&
    !betBusy &&
    !betConfirming &&
    hasValidBetAmount;
  const claimableEpochId = match?.claimableEpochIds?.[0];
  const canClaim =
    typeof claimableEpochId === "number" &&
    Boolean(address) &&
    !claimBusy &&
    !claimConfirming;

  const ensureWalletOnMonad = useCallback(async () => {
    const detectedBefore = await readWalletChainId(walletClient);
    if (detectedBefore === MONAD_MAINNET_CHAIN_ID || resolvedChainId === MONAD_MAINNET_CHAIN_ID) {
      return;
    }

    try {
      await ensureMonadNetwork(walletClient);
    } catch {
      if (switchChain) {
        switchChain({ chainId: MONAD_MAINNET_CHAIN_ID });
      }
      throw new Error("Switch to Monad mainnet in wallet and retry.");
    }

    const detectedAfter = await readWalletChainId(walletClient);
    if (detectedAfter !== MONAD_MAINNET_CHAIN_ID) {
      throw new Error("Switch to Monad mainnet in wallet and retry.");
    }
    setWalletChainId(detectedAfter);
  }, [resolvedChainId, switchChain, walletClient]);

  const submitVote = useCallback(
    async (side: VoteSide) => {
      if (!address || !match?.nowPlaying || !canVote) {
        return;
      }

      setVoteBusy(true);
      setVoteError(null);

      try {
        await ensureWalletOnMonad();

        const hash = await writeContractAsync({
          address: epochArenaAddress,
          abi: epochArenaAbi,
          functionName: "vote",
          args: [lobbyIdBytes32, voteSideToContractSide(side)],
          chainId: MONAD_MAINNET_CHAIN_ID,
        });

        setVoteTxHash(hash);

        // Keep local engine mutation path active while chain voting is primary source of truth.
        await fetch("/api/vote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lobbyId,
            clipId: match.nowPlaying.clipId,
            side,
            address,
          }),
        }).catch(() => undefined);

        await Promise.all([fetchMatch(), refetchOnchainTally(), refetchHasVoted()]);
      } catch (submitError) {
        const message = submitError instanceof Error ? submitError.message : "Vote failed.";
        const lower = message.toLowerCase();
        if (
          lower.includes("does not match the target chain") ||
          lower.includes("wallet is not on monad") ||
          lower.includes("switch to monad")
        ) {
          setVoteError("Switch to Monad mainnet in wallet and retry vote.");
        } else {
          setVoteError(message);
        }
      } finally {
        setVoteBusy(false);
      }
    },
    [
      address,
      canVote,
      ensureWalletOnMonad,
      fetchMatch,
      lobbyId,
      lobbyIdBytes32,
      match?.nowPlaying,
      refetchHasVoted,
      refetchOnchainTally,
      writeContractAsync,
    ],
  );

  const submitBet = useCallback(
    async (side: VoteSide) => {
      if (!address || !canBet || !parsedBetWei || !match) {
        return;
      }

      setBetBusy(true);
      setBetError(null);

      try {
        await ensureWalletOnMonad();

        const hash = await writeContractAsync({
          address: epochArenaAddress,
          abi: epochArenaAbi,
          functionName: "placeBet",
          args: [lobbyIdBytes32, betSideToContractSide(side)],
          value: parsedBetWei,
          chainId: MONAD_MAINNET_CHAIN_ID,
        });

        setBetTxHash(hash);

        await fetch("/api/bet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lobbyId,
            epochId: currentEpochIdNumber,
            side,
            amountWei: parsedBetWei.toString(),
            address,
          }),
        }).catch(() => undefined);

        await fetchMatch();
      } catch (submitError) {
        setBetError(submitError instanceof Error ? submitError.message : "Bet failed.");
      } finally {
        setBetBusy(false);
      }
    },
    [
      address,
      canBet,
      currentEpochIdNumber,
      ensureWalletOnMonad,
      fetchMatch,
      lobbyId,
      lobbyIdBytes32,
      match,
      parsedBetWei,
      writeContractAsync,
    ],
  );

  const submitClaim = useCallback(async () => {
    if (!address || !canClaim || typeof claimableEpochId !== "number") {
      return;
    }

    setClaimBusy(true);
    setClaimError(null);

    try {
      await ensureWalletOnMonad();

      const hash = await writeContractAsync({
        address: epochArenaAddress,
        abi: epochArenaAbi,
        functionName: "claim",
        args: [lobbyIdBytes32, BigInt(claimableEpochId)],
        chainId: MONAD_MAINNET_CHAIN_ID,
      });

      setClaimTxHash(hash);
      setPendingClaimEpochId(claimableEpochId);
    } catch (submitError) {
      setClaimError(submitError instanceof Error ? submitError.message : "Claim failed.");
    } finally {
      setClaimBusy(false);
    }
  }, [
    address,
    canClaim,
    claimableEpochId,
    ensureWalletOnMonad,
    fetchMatch,
    lobbyId,
    lobbyIdBytes32,
    writeContractAsync,
  ]);

  useEffect(() => {
    if (!claimConfirmed || !claimTxHash || pendingClaimEpochId === null || !address) {
      return;
    }

    let cancelled = false;

    const mirrorClaim = async () => {
      await fetch("/api/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lobbyId,
          epochId: pendingClaimEpochId,
          address,
        }),
      }).catch(() => undefined);

      await fetchMatch();

      if (!cancelled) {
        setPendingClaimEpochId(null);
      }
    };

    void mirrorClaim();

    return () => {
      cancelled = true;
    };
  }, [address, claimConfirmed, claimTxHash, fetchMatch, lobbyId, pendingClaimEpochId]);

  useEffect(() => {
    if (!claimFailed) {
      return;
    }

    const message =
      claimReceiptError instanceof Error ? claimReceiptError.message : "Claim transaction failed.";
    setClaimError(message);
    setPendingClaimEpochId(null);
  }, [claimFailed, claimReceiptError]);

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
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">{match.lobby.displayName}</p>
            <h1 className="font-display text-3xl uppercase tracking-[0.1em] text-white">
              {phaseTitle(match.phase, match.status)}
            </h1>
            <p className="mt-1 text-xs text-white/65">{match.lobby.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-right text-sm">
            <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-2">
              <p className="text-xs text-cyan-100/70">Status</p>
              <p className="font-display text-cyan-100">{match.status}</p>
            </div>
            <div className="rounded-xl border border-red-300/30 bg-red-400/10 px-3 py-2">
              <p className="text-xs text-red-100/70">Clip Timer</p>
              <p className="font-display text-red-100">
                {clipTimeLeft !== null ? `${clipTimeLeft}s` : match.status === "LIVE" ? "PAUSE" : "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/75">
          <span className="rounded-full border border-white/20 px-3 py-1">Listeners: {match.listeners}</span>
          <span className="rounded-full border border-white/20 px-3 py-1">
            Total clips played: {match.totalClipsPlayed}
          </span>
          <span className="rounded-full border border-white/20 px-3 py-1">Match ID: {match.matchId}</span>
          <span className="rounded-full border border-white/20 px-3 py-1">
            Epoch #{currentEpochIdNumber}: {epochCountdown}
          </span>
          <span className="rounded-full border border-white/20 px-3 py-1">
            Epoch status: {epochEnded ? "Ended" : "Open"}
          </span>
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
        <p className="text-xs text-cyan-200/80">Audio unlocked. Clips play 10s with a 2.5s pause between agents.</p>
      )}

      {wrongChain ? (
        <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm text-amber-100">
          <p>Wallet is on the wrong network.</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Current chain: {resolvedChainId ?? "unknown"} | Required: {MONAD_MAINNET_CHAIN_ID}
          </p>
          <button
            type="button"
            onClick={() => {
              void ensureMonadNetwork(walletClient).catch(() => {
                switchChain({ chainId: MONAD_MAINNET_CHAIN_ID });
              });
            }}
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
              const isActive = match.nowPlaying?.agentId === agent.id;

              return (
                <article
                  key={agent.id}
                  className={`rounded-2xl border bg-arena-900/65 p-4 transition ${
                    agent.id === "A" ? "border-cyan-300/35" : "border-red-300/35"
                  } ${isActive ? (agent.id === "A" ? "shadow-neon" : "shadow-blood") : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-display text-xl uppercase tracking-[0.1em] text-white">Agent {agent.id}</p>
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

                  <p className="mt-2 text-xs text-white/70">Intensity: {(agent.intensity * 100).toFixed(0)}%</p>
                  <p className="mt-1 text-xs text-white/70">
                    Mutation: {(agent.mutationSensitivity * 100).toFixed(0)}%
                  </p>
                  <p className="mt-1 text-xs text-white/70">Risk: {(agent.riskLevel * 100).toFixed(0)}%</p>
                  <p className="mt-1 text-xs text-white/70">Bankroll: {agent.bankroll.toFixed(2)} pts</p>
                  <p className="mt-1 text-xs text-white/70">Clips: {agent.clipsPlayed}</p>
                  <p className="mt-1 text-xs text-white/70">
                    W/L: {agent.wins}/{agent.losses}
                  </p>
                  <p className="mt-1 text-xs text-white/70">
                    Epoch W/L: {agent.winCount}/{agent.lossCount}
                  </p>
                </article>
              );
            })}
          </div>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h2 className="font-display text-lg uppercase tracking-[0.1em] text-white">Live Clip History</h2>
            <p className="mt-1 text-xs text-white/70">Last 10 clips in this lobby only.</p>

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
                        {shortTime(item.startedAt)} - Epoch {item.epochId} - Agent {item.agentId} - {item.style}
                      </p>
                      <p>
                        votes {item.voteTally.aVotes}:{item.voteTally.bVotes} ({item.voteTally.winner})
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
                <p>Clip: {match.nowPlaying.clipId}</p>
                <p>Agent: {match.nowPlaying.agentId}</p>
                <p>Style: {match.nowPlaying.style}</p>
                <p>Strategy: {match.nowPlaying.strategy}</p>
                <p>Intensity: {(match.nowPlaying.intensity * 100).toFixed(0)}%</p>
                <p>Confidence: {(match.nowPlaying.confidence * 100).toFixed(0)}%</p>
                <p>BPM: {match.nowPlaying.bpm.toFixed(1)}</p>
                <p>Density: {(match.nowPlaying.patternDensity * 100).toFixed(0)}%</p>
                <p>Distortion: {(match.nowPlaying.distortion * 100).toFixed(0)}%</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-white/70">
                {match.status === "LIVE"
                  ? "Transition pause between clips (2.5s)."
                  : "Lobby is idle. Waiting for listeners."}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h3 className="font-display text-lg uppercase tracking-[0.1em] text-white">Vote This Clip</h3>
            <p className="mt-2 text-xs text-white/70">
              Vote goes on-chain to Monad. Tally is read from contract every 5 seconds.
            </p>
            <p className="mt-1 text-xs text-white/70">
              Epoch #{currentEpochIdNumber} ends in {epochCountdown}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void submitVote("A")}
                disabled={!canVote}
                className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vote Agent A
              </button>
              <button
                type="button"
                onClick={() => void submitVote("B")}
                disabled={!canVote}
                className="rounded-xl border border-red-300/35 bg-red-300/10 px-3 py-2 text-xs font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vote Agent B
              </button>
            </div>

            <div className="mt-3 text-xs text-white/80">
              <p>Live tally: A {onchainTally?.aVotes ?? 0} - B {onchainTally?.bVotes ?? 0}</p>
              <p>
                Winner:{" "}
                {(onchainTally?.aVotes ?? 0) === (onchainTally?.bVotes ?? 0)
                  ? "TIE"
                  : (onchainTally?.aVotes ?? 0) > (onchainTally?.bVotes ?? 0)
                    ? "A"
                    : "B"}
              </p>
              <p>Epoch status: {epochEnded ? "Ended" : "Open"}</p>
              <p>Your vote: {hasVotedOnchain ? "Already voted this epoch" : "Not voted"}</p>
              {voteTxHash ? <p>Tx: {voteTxHash}</p> : null}
            </div>

            {voteBusy || voteConfirming ? (
              <p className="mt-2 text-xs text-white/70">
                {voteConfirming ? "Waiting for tx confirmation..." : "Submitting vote..."}
              </p>
            ) : null}
            {voteError ? <p className="mt-2 text-xs text-red-300">{voteError}</p> : null}
          </section>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h3 className="font-display text-lg uppercase tracking-[0.1em] text-white">Bet This Epoch</h3>
            <p className="mt-2 text-xs text-white/70">Bets stay open until epoch end.</p>

            <div className="mt-3 grid gap-2">
              <label className="text-xs text-white/70" htmlFor="bet-amount">
                MON amount
              </label>
              <input
                id="bet-amount"
                type="number"
                min="0"
                step="0.001"
                value={betAmount}
                onChange={(event) => setBetAmount(event.target.value)}
                className="rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void submitBet("A")}
                disabled={!canBet}
                className="rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bet Agent A
              </button>
              <button
                type="button"
                onClick={() => void submitBet("B")}
                disabled={!canBet}
                className="rounded-xl border border-red-300/35 bg-red-300/10 px-3 py-2 text-xs font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Bet Agent B
              </button>
            </div>

            <div className="mt-3 text-xs text-white/80">
              <p>
                Total Bet A: {formatMon(match.currentEpoch.totalBetAWei)} MON | Total Bet B:{" "}
                {formatMon(match.currentEpoch.totalBetBWei)} MON
              </p>
              <p>
                Your epoch bet: {formatMon(match.viewerBet?.totalWei ?? "0")} MON (A{" "}
                {formatMon(match.viewerBet?.amountAWei ?? "0")} / B{" "}
                {formatMon(match.viewerBet?.amountBWei ?? "0")})
              </p>
              {betTxHash ? <p>Bet tx: {betTxHash}</p> : null}
            </div>

            {betBusy || betConfirming ? (
              <p className="mt-2 text-xs text-white/70">
                {betConfirming ? "Waiting for bet confirmation..." : "Submitting bet..."}
              </p>
            ) : null}
            {betError ? <p className="mt-2 text-xs text-red-300">{betError}</p> : null}
          </section>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h3 className="font-display text-lg uppercase tracking-[0.1em] text-white">Claim</h3>
            <p className="mt-2 text-xs text-white/70">
              Claim after on-chain epoch finalization. Off-chain mirror marks claimed after tx.
            </p>
            <p className="mt-2 text-xs text-white/80">
              Claimable epochs: {match.claimableEpochIds.length > 0 ? match.claimableEpochIds.join(", ") : "none"}
            </p>

            <button
              type="button"
              onClick={() => void submitClaim()}
              disabled={!canClaim}
              className="mt-3 rounded-xl border border-emerald-300/35 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canClaim ? `Claim Epoch #${claimableEpochId}` : "No claim available"}
            </button>

            {claimTxHash ? <p className="mt-2 text-xs text-white/80">Claim tx: {claimTxHash}</p> : null}
            {claimBusy || claimConfirming ? (
              <p className="mt-2 text-xs text-white/70">
                {claimConfirming ? "Waiting for claim confirmation..." : "Submitting claim..."}
              </p>
            ) : null}
            {claimError ? <p className="mt-2 text-xs text-red-300">{claimError}</p> : null}
          </section>

          <section className="rounded-2xl border border-white/15 bg-arena-900/65 p-4">
            <h3 className="font-display text-lg uppercase tracking-[0.1em] text-white">Epoch History</h3>
            {match.epochHistory.length === 0 ? (
              <p className="mt-2 text-xs text-white/70">No finalized epochs yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {match.epochHistory.map((entry) => (
                  <li key={entry.epochId} className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-xs text-white/85">
                    <p>
                      Epoch #{entry.epochId} winner {entry.winner} | votes {entry.votesA}:{entry.votesB}
                    </p>
                    <p>
                      Pool {formatMon(sumWei(entry.totalBetAWei, entry.totalBetBWei))} MON (A{" "}
                      {formatMon(entry.totalBetAWei)} / B {formatMon(entry.totalBetBWei)})
                    </p>
                    <p>
                      Agent A BR {entry.agentPerformance.A.bankroll.toFixed(2)} / Agent B BR {entry.agentPerformance.B.bankroll.toFixed(2)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {uiMessage ? <p className="text-xs text-white/80">{uiMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}
