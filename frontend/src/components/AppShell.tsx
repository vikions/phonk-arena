"use client";

import { usePathname } from "next/navigation";

import { TopBar } from "@/components/TopBar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isFoyer = pathname === "/lobbies";

  return (
    <>
      <TopBar />
      <main
        className={
          isHome
            ? "h-[calc(100dvh-var(--topbar-height))] overflow-hidden"
            : isFoyer
              ? "mx-auto flex min-h-[calc(100dvh-var(--topbar-height))] w-full max-w-[92rem] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:h-[calc(100dvh-var(--topbar-height))] lg:overflow-hidden lg:px-5 lg:py-4 xl:px-6"
              : "mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8"
        }
      >
        {children}
      </main>
    </>
  );
}
