import { LobbiesClient } from "@/components/LobbiesClient";

export default function LobbiesPage() {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Arena Index</p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-[0.1em] text-white">Lobbies</h1>
        <p className="mt-2 text-sm text-white/75">
          One live lobby. Status flips to LIVE when at least one listener is connected.
        </p>
      </section>

      <LobbiesClient />
    </div>
  );
}