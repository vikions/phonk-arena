"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { OnchainTractionSummary } from "@/lib/onchainTractionTypes";

function shortHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

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

export function TractionPanel() {
  const [summary, setSummary] = useState<OnchainTractionSummary>(emptySummary);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
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
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load onchain traction summary.");
        }
      }
    };

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

  return (
    <section className="panel-shell rounded-[1.8rem] px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/46">Onchain Traction</p>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-[0.1em] text-white">
            Ink Contract Activity
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
            Direct reads from the live arena sidecar: active bettors, repeat usage, confirmed bets, volume, and current
            locked pool.
          </p>
        </div>

        <div className="mono text-[11px] uppercase tracking-[0.14em] text-white/52">
          <p>Source: {summary.networkLabel} onchain</p>
          <p className="mt-1">Updated: {new Date(summary.generatedAt).toLocaleTimeString()}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Active Wallets</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.activeBettors24h}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Onchain Tx</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.bets24h}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Volume</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.volume24hEth}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/38">ETH</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">7d Repeat Wallets</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.repeatBettors7d}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">Current TVL</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.currentEpochPoolEth}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-white/38">ETH locked</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
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
              <span className="feature-badge">Contract unavailable</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">Current Epoch</p>
              <p className="stat-value mt-1">{summary.currentEpochId ?? "none"}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">Epoch Status</p>
              <p className="stat-value mt-1">{epochStatus(summary.currentEpochOpen)}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">Epoch Bettors</p>
              <p className="stat-value mt-1">{summary.currentEpochBettors}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">7d Volume</p>
              <p className="stat-value mt-1">{summary.volume7dEth} ETH</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">7d Bets</p>
              <p className="stat-value mt-1">{summary.bets7d}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">7d Active Wallets</p>
              <p className="stat-value mt-1">{summary.activeBettors7d}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-white/38">
            Latest block {summary.latestBlock ?? "unknown"} · scanned from {summary.scannedFromBlock ?? "unknown"}
          </p>
        </div>

        <div className="rounded-[1.2rem] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="stat-label">Recent Onchain Bets</p>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">BetPlaced</span>
          </div>

          {summary.recentBets.length === 0 ? (
            <p className="mt-3 text-sm text-white/62">No BetPlaced events found in the current scan window.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.recentBets.map((entry) => (
                <li key={`${entry.txHash}:${entry.blockNumber}`} className="data-chip rounded-[6px] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/68">
                      Agent {entry.agentId} · Epoch {entry.epochId}
                    </p>
                    <p className="text-xs text-white/42">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString() : `Block ${entry.blockNumber}`}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="mono text-xs text-white/82">{shortHash(entry.txHash)}</p>
                      <p className="mt-1 text-xs text-white/42">
                        {shortAddress(entry.walletAddress)} · {entry.amountEth} ETH
                      </p>
                    </div>
                    <Link
                      href={`${summary.explorerUrl}/tx/${entry.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs uppercase tracking-[0.14em] text-cyan-200/86 transition hover:text-cyan-100"
                    >
                      View Tx
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
    </section>
  );
}
