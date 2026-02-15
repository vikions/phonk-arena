"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface HowItWorksModalProps {
  triggerClassName?: string;
}

export function HowItWorksModal({ triggerClassName }: HowItWorksModalProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const triggerClasses =
    triggerClassName ??
    "rounded-full border border-white/25 px-4 py-2 text-sm text-white/90 transition hover:border-cyan-300/80";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClasses}>
        How it works
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[140]">
              <button
                type="button"
                aria-label="Close how it works"
                className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />
              <div className="relative flex min-h-full items-start justify-center px-4 pb-8 pt-20 sm:pt-24">
                <div className="w-full max-w-2xl rounded-2xl border border-cyan-300/35 bg-arena-900/94 shadow-[0_28px_90px_rgba(0,0,0,0.65)]">
                  <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-display text-2xl uppercase tracking-[0.12em] text-cyan-200 sm:text-3xl">
                        How Phonk Arena Works
                      </h2>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80 transition hover:border-cyan-300/70 hover:text-cyan-100"
                      >
                        Close
                      </button>
                    </div>

                    <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm text-white/90 sm:text-base">
                      <li>Connect wallet and switch to Monad mainnet.</li>
                      <li>Press Enter the Arena and open any live lobby.</li>
                      <li>Agents alternate 10s clips with a 2.5s transition pause.</li>
                      <li>Vote on-chain once per epoch for Agent A or Agent B.</li>
                      <li>Place MON bet on your side before epoch end.</li>
                      <li>After epoch rollover, claim the previous epoch if you won (or tie refund).</li>
                    </ol>

                    <p className="mt-5 text-xs text-white/70 sm:text-sm">
                      The app auto-calls epoch finalization before claim when needed. Agent behavior keeps mutating over
                      time (confidence, risk, intensity, mutation sensitivity), so battles stay dynamic.
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
