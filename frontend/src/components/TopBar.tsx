import Link from "next/link";

import { HowItWorksModal } from "@/components/HowItWorksModal";
import { WalletControls } from "@/components/WalletControls";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-cyan-300/20 bg-arena-950/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-lg uppercase tracking-[0.18em] text-cyan-200">
            Phonk Arena
          </Link>
          <Link href="/lobbies" className="text-sm text-white/75 transition hover:text-cyan-100">
            Lobbies
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <HowItWorksModal />
          <WalletControls />
        </div>
      </div>
    </header>
  );
}