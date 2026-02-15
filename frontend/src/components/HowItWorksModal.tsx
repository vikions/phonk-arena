"use client";

import { useState } from "react";

export function HowItWorksModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/25 px-4 py-2 text-sm text-white/90 transition hover:border-cyan-300/80"
      >
        How it works
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-cyan-300/35 bg-arena-900 p-6 shadow-[0_22px_70px_rgba(0,0,0,0.55)]">
            <h2 className="font-display text-2xl uppercase tracking-[0.12em] text-cyan-200">
              Live Phonk Flow
            </h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-white/85">
              <li>Connect wallet and switch to Monad mainnet.</li>
              <li>Open lobby; your session joins listener presence.</li>
              <li>When listeners exist, server loop runs live clips continuously.</li>
              <li>Playback sequence is fixed: Agent A 10s, then Agent B 10s, forever.</li>
              <li>Vote once per clip; clip vote result mutates both agents for upcoming clips.</li>
              <li>Last 10 clips are shown in history with timestamp and clip meta.</li>
            </ol>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 rounded-full border border-cyan-300/50 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-100"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
