"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";

import { AgentCard } from "@/components/AgentCard";
import {
  epochArenaAbi,
  epochArenaAddress,
  getAgentDNA,
  getCurrentEpochId,
  getEpochTokenSelection,
  isEpochArenaAddressConfigured,
} from "@/lib/contract";
import { DEFAULT_DNA } from "@/lib/musicEngine";
import type { AgentDNA } from "@/lib/musicEngine";
import type { DailyAgentPicksResponse, InkToken } from "@/lib/tokenDiscovery";

type ArenaAgentId = 0 | 1 | 2 | 3;

interface EpochBattleSectionProps {
  onBet?: (agentId: number, amount: string) => void;
}

const AGENT_IDS = [0, 1, 2, 3] as const;

type TokenMap = Record<ArenaAgentId, InkToken | null>;
type DnaMap = Record<ArenaAgentId, AgentDNA>;
type RecordMap = Record<ArenaAgentId, { wins: number; losses: number }>;

function defaultTokenMap(): TokenMap {
  return { 0: null, 1: null, 2: null, 3: null };
}

function defaultDnaMap(): DnaMap {
  return {
    0: DEFAULT_DNA[0],
    1: DEFAULT_DNA[1],
    2: DEFAULT_DNA[2],
    3: DEFAULT_DNA[3],
  };
}

function defaultRecordMap(): RecordMap {
  return {
    0: { wins: 0, losses: 0 },
    1: { wins: 0, losses: 0 },
    2: { wins: 0, losses: 0 },
    3: { wins: 0, losses: 0 },
  };
}

function selectionToToken(selection: Awaited<ReturnType<typeof getEpochTokenSelection>>): InkToken | null {
  if (!selection || !selection.tokenAddress || selection.tokenAddress === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  return {
    address: selection.tokenAddress,
    symbol: selection.tokenSymbol || "UNKNOWN",
    name: selection.tokenSymbol || "Selected Token",
    priceChange24h: selection.priceChangeAtSelection,
    volume24h: selection.volumeAtSelection,
    holderCount: 0,
    circulatingMarketCap: 0,
  };
}

export function EpochBattleSection({ onBet }: EpochBattleSectionProps) {
  const publicClient = usePublicClient();
  const [tokens, setTokens] = useState<TokenMap>(() => defaultTokenMap());
  const [dnas, setDnas] = useState<DnaMap>(() => defaultDnaMap());
  const [records, setRecords] = useState<RecordMap>(() => defaultRecordMap());
  const [status, setStatus] = useState<string | null>(null);

  const { data: currentEpochIdRaw } = useReadContract({
    address: epochArenaAddress,
    abi: epochArenaAbi,
    functionName: "currentEpochId",
    query: {
      enabled: isEpochArenaAddressConfigured,
      refetchInterval: 15_000,
    },
  });

  const currentEpochId = useMemo(
    () => (typeof currentEpochIdRaw === "bigint" ? currentEpochIdRaw : getCurrentEpochId()),
    [currentEpochIdRaw],
  );

  const loadEpochData = useCallback(async () => {
    const nextTokens = defaultTokenMap();
    const nextDnas = defaultDnaMap();
    const nextRecords = defaultRecordMap();
    try {
      const picksResponse = await fetch("/api/epoch-battle", {
        cache: "no-store",
      });
      if (!picksResponse.ok) {
        throw new Error("Failed to load daily agent picks.");
      }

      const picksPayload = (await picksResponse.json()) as DailyAgentPicksResponse;
      const fallbackTokens = new Map(
        (picksPayload.picks || []).map((pick) => [pick.agentId, pick.token as InkToken]),
      );

      await Promise.all(
        AGENT_IDS.map(async (agentId) => {
          const [contractDNA, contractSelection] = await Promise.all([
            getAgentDNA(agentId, publicClient),
            getEpochTokenSelection(currentEpochId, agentId, publicClient),
          ]);

          if (contractDNA) {
            nextDnas[agentId] = {
              bpmRange: contractDNA.bpmRange || DEFAULT_DNA[agentId].bpmRange,
              layerDensity: contractDNA.layerDensity || DEFAULT_DNA[agentId].layerDensity,
              glitchIntensity: contractDNA.glitchIntensity || DEFAULT_DNA[agentId].glitchIntensity,
              bassWeight: contractDNA.bassWeight || DEFAULT_DNA[agentId].bassWeight,
              mutationVersion: contractDNA.mutationVersion,
            };
            nextRecords[agentId] = {
              wins: contractDNA.wins,
              losses: contractDNA.losses,
            };
          }

          const selectionToken = selectionToToken(contractSelection);
          nextTokens[agentId] = selectionToken ?? fallbackTokens.get(agentId) ?? null;
        }),
      );

      for (const entry of picksPayload.profiles || []) {
        nextDnas[entry.agentId] = {
          bpmRange: entry.profile.bpmRange || DEFAULT_DNA[entry.agentId].bpmRange,
          layerDensity: entry.profile.layerDensity || DEFAULT_DNA[entry.agentId].layerDensity,
          glitchIntensity: entry.profile.glitchIntensity || DEFAULT_DNA[entry.agentId].glitchIntensity,
          bassWeight: entry.profile.bassWeight || DEFAULT_DNA[entry.agentId].bassWeight,
          mutationVersion: entry.profile.mutationVersion,
        };
        nextRecords[entry.agentId] = {
          wins: entry.profile.wins,
          losses: entry.profile.losses,
        };
      }

      setTokens(nextTokens);
      setDnas(nextDnas);
      setRecords(nextRecords);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load epoch battle data.");
    }
  }, [currentEpochId, publicClient]);

  useEffect(() => {
    void loadEpochData();
  }, [loadEpochData]);

  const handleBet = useCallback(
    (agentId: number, amount: string) => {
      if (onBet) {
        onBet(agentId, amount);
        return;
      }

      setStatus(`Bet intent captured for agent ${agentId} (${amount} ETH).`);
    },
    [onBet],
  );

  return (
    <section className="rounded-2xl border border-white/15 bg-black/30 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/55">This Epoch's Battle</p>
          <h2 className="font-display text-2xl uppercase tracking-[0.1em] text-white">
            Agent Token Face-Off
          </h2>
        </div>
        <p className="text-xs font-mono text-white/70">Epoch #{currentEpochId.toString()}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {AGENT_IDS.map((agentId) => (
          <AgentCard
            key={agentId}
            agentId={agentId}
            token={tokens[agentId]}
            dna={dnas[agentId]}
            wins={records[agentId].wins}
            losses={records[agentId].losses}
            onBet={handleBet}
          />
        ))}
      </div>

      {status ? <p className="mt-3 text-xs text-white/70">{status}</p> : null}
    </section>
  );
}
