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
          <WalletControls />
        </div>
      </div>
    </header>
  );
}
