import Link from "next/link";

import { WalletControls } from "@/components/WalletControls";

export function TopBar() {
  return (
    <header className="nav-shell sticky top-0 z-40 h-16">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="nav-logo">
            Phonk Arena
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/traction"
            className="hidden rounded-[6px] border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/62 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white sm:inline-flex"
          >
            Metrics
          </Link>
          <WalletControls />
        </div>
      </div>
    </header>
  );
}
