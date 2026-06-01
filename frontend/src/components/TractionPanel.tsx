"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { OnchainTractionSummary } from "@/lib/onchainTractionTypes";

const SNAPSHOT_STORAGE_KEY = "phonk_arena_onchain_traction_snapshot";

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function emptySummary(): OnchainTractionSummary {
  return {
    enabled: false,
    source: "onchain",
    generatedAt: new Date().toISOString(),
    networkLabel: "Ink",
    explorerUrl: "https://explorer.inkonchain.com",
    contractAddress: "",
    currentEpochId: null,
    currentEpochOpen: null,
    currentEpochPoolEth: "0",
    currentEpochBettors: 0,
    bets24h: 0,
    activeBettors24h: 0,
    volume24hEth: "0",
    bets7d: 0,
    activeBettors7d: 0,
    repeatBettors7d: 0,
    volume7dEth: "0",
    latestBlock: null,
    scannedFromBlock: null,
    recentBets: [],
  };
}

function epochStatus(value: boolean | null): string {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Open" : "Closed";
}

function isOnchainSummary(value: unknown): value is OnchainTractionSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return record.source === "onchain" && typeof record.generatedAt === "string";
}

function readStoredSummary(): OnchainTractionSummary | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isOnchainSummary(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function storeSummary(summary: OnchainTractionSummary): void {
  if (!summary.enabled) {
    return;
  }

  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(summary));
  } catch {
    // Server cache is the source of truth; this only keeps repeat page visits instant.
  }
}

export function TractionPanel() {
  const [summary, setSummary] = useState<OnchainTractionSummary>(emptySummary);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnceRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (loadedOnceRef.current) {
          setRefreshing(true);
        }

        const response = await fetch("/api/onchain/traction?network=ink", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load onchain traction summary.");
        }

        const payload = (await response.json()) as OnchainTractionSummary;
        if (!cancelled) {
          setSummary(payload);
          setError(payload.error ?? null);
          setLoading(false);
          setRefreshing(false);
          loadedOnceRef.current = true;
          storeSummary(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load onchain traction summary.");
          setLoading(false);
          setRefreshing(false);
          loadedOnceRef.current = true;
        }
      }
    };

    const storedSummary = readStoredSummary();
    if (storedSummary) {
      setSummary(storedSummary);
      setLoading(false);
      loadedOnceRef.current = true;
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const contractUrl = summary.contractAddress ? `${summary.explorerUrl}/address/${summary.contractAddress}` : "";
  const value = (metric: string | number | null | undefined, fallback = "0") =>
    loading ? "..." : (metric ?? fallback);

  return (
    <section className="panel-shell rounded-[1.8rem] px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/46">Onchain Traction</p>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-[0.1em] text-white">
            Ink Contract Activity
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
            Direct reads from the live arena sidecar: active bettors, repeat usage, confirmed bets, and current epoch
            state.
          </p>
        </div>

        <div className="mono text-[11px] uppercase tracking-[0.14em] text-white/52">
          <p>Source: {summary.networkLabel} onchain</p>
          <p className="mt-1">
            {loading ? "Loading contract data..." : `Updated: ${new Date(summary.generatedAt).toLocaleTimeString()}`}
          </p>
          {refreshing ? <p className="mt-1 text-cyan-200/72">Refreshing...</p> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Active Wallets</p>
          <p className="agent-name mt-2 text-[1.8rem]">{value(summary.activeBettors24h)}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Onchain Tx</p>
          <p className="agent-name mt-2 text-[1.8rem]">{value(summary.bets24h)}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">7d Active Wallets</p>
          <p className="agent-name mt-2 text-[1.8rem]">{value(summary.activeBettors7d)}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">7d Repeat Wallets</p>
          <p className="agent-name mt-2 text-[1.8rem]">{value(summary.repeatBettors7d)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="rounded-[1.2rem] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="stat-label">Contract Signal</p>
            {contractUrl ? (
              <Link
                href={contractUrl}
                target="_blank"
                rel="noreferrer"
                className="feature-badge transition hover:text-cyan-100"
              >
                Contract {shortAddress(summary.contractAddress)}
              </Link>
            ) : (
              <span className="feature-badge">{loading ? "Loading contract" : "Contract unavailable"}</span>
            )}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">Current Epoch</p>
              <p className="stat-value mt-1">{value(summary.currentEpochId, "none")}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">Epoch Status</p>
              <p className="stat-value mt-1">{loading ? "..." : epochStatus(summary.currentEpochOpen)}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">Epoch Bettors</p>
              <p className="stat-value mt-1">{value(summary.currentEpochBettors)}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">7d Bets</p>
              <p className="stat-value mt-1">{value(summary.bets7d)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-white/38">
            Latest block {value(summary.latestBlock, "unknown")} / scanned from{" "}
            {value(summary.scannedFromBlock, "unknown")}
          </p>
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
