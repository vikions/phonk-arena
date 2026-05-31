import Link from "next/link";

import { TractionPanel } from "@/components/TractionPanel";

export default function TractionPage() {
  return (
    <div className="space-y-5">
      <section className="panel-shell relative overflow-hidden rounded-[1.8rem] px-5 py-6 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(192,38,211,0.14),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_18%_90%,rgba(244,63,94,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="hero-eyebrow text-xs text-white/48">Traction Layer</p>
            <h1 className="section-title mt-2 text-white">Onchain Contract Traction</h1>
            <p className="subtitle mt-3 max-w-2xl text-sm leading-6 text-white/72 sm:text-base">
              Live Ink metrics pulled directly from the arena sidecar contract: active wallets, repeat usage, confirmed
              bets, volume, and current locked pool.
            </p>
          </div>

          <Link href="/lobbies" className="btn-battle inline-flex">
            Back To Lobbies
          </Link>
        </div>
      </section>

      <TractionPanel />
    </div>
  );
}
