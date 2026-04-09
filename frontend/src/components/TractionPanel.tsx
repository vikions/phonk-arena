"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { TractionSummary } from "@/lib/analyticsTypes";
import { INK_MAINNET_EXPLORER_URL } from "@/lib/inkChain";

function shortHash(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function emptySummary(): TractionSummary {
  return {
    enabled: false,
    backend: "file",
    generatedAt: new Date().toISOString(),
    liveListeners: 0,
    pageViews24h: 0,
    uniqueSessions24h: 0,
    battleSessions24h: 0,
    uniqueWallets24h: 0,
    submittedTransactions24h: 0,
    confirmedTransactions24h: 0,
    repeatSessions7d: 0,
    recentTransactions: [],
  };
}

export function TractionPanel() {
  const [summary, setSummary] = useState<TractionSummary>(emptySummary);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/analytics/summary", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed to load traction summary.");
        }

        const payload = (await response.json()) as TractionSummary;
        if (!cancelled) {
          setSummary(payload);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load traction summary.");
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

  return (
    <section className="panel-shell rounded-[1.8rem] px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/46">Traction Layer</p>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-[0.1em] text-white">Live Reach Snapshot</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
            Small product instrumentation for resubmission proof. This shows direct app reach and confirmed user activity.
          </p>
        </div>

        <div className="mono text-[11px] uppercase tracking-[0.14em] text-white/52">
          <p>Backend: {summary.backend}</p>
          <p className="mt-1">Updated: {new Date(summary.generatedAt).toLocaleTimeString()}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Sessions</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.uniqueSessions24h}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Battle Joins</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.battleSessions24h}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Wallets</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.uniqueWallets24h}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">24h Confirmed Tx</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.confirmedTransactions24h}</p>
        </div>
        <div className="data-chip rounded-[6px] px-4 py-4">
          <p className="stat-label">7d Repeat Sessions</p>
          <p className="agent-name mt-2 text-[1.8rem]">{summary.repeatSessions7d}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.2rem] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="stat-label">Current Signal</p>
            <span className="feature-badge">Listeners {summary.liveListeners}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">24h Views</p>
              <p className="stat-value mt-1">{summary.pageViews24h}</p>
            </div>
            <div className="data-chip rounded-[6px] px-3 py-3">
              <p className="stat-label">24h Submitted Tx</p>
              <p className="stat-value mt-1">{summary.submittedTransactions24h}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.2rem] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="stat-label">Recent Confirmed Activity</p>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/42">Bet + Claim</span>
          </div>

          {summary.recentTransactions.length === 0 ? (
            <p className="mt-3 text-sm text-white/62">
              No confirmed transactions tracked yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.recentTransactions.map((entry) => (
                <li key={`${entry.eventName}:${entry.txHash}`} className="data-chip rounded-[6px] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/68">
                      {entry.eventName === "bet_confirmed" ? "Bet Confirmed" : "Claim Confirmed"}
                    </p>
                    <p className="text-xs text-white/42">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="mono text-xs text-white/82">{shortHash(entry.txHash)}</p>
                    <Link
                      href={`${INK_MAINNET_EXPLORER_URL}/tx/${entry.txHash}`}
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
