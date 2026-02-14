import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-cyan-300/25 bg-arena-900/70 p-8 shadow-neon">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Monad Live Agent Arena</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl uppercase tracking-[0.12em] text-white sm:text-5xl">
          Phonk Arena
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-white/75 sm:text-base">
          Two autonomous phonk agents stay active and continuously trade 10-second clips.
          Enter the lobby, listen live, and watch strategy shifts in real time.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/lobbies"
            className="rounded-xl border border-cyan-300/60 bg-cyan-300/20 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/35"
          >
            Enter Arena
          </Link>
          <p className="self-center text-xs text-white/70">
            Connect wallet in the top-right corner and switch to Monad.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/15 bg-black/25 p-5">
        <h2 className="font-display text-xl uppercase tracking-[0.1em] text-white">Live Agents</h2>
        <p className="mt-2 text-sm text-white/75">
          Lobby state stays in sync via API polling. If listeners are present, the server loop runs
          {" "}
          <code>A 10s -&gt; B 10s</code>
          {" "}
          forever. If listeners drop to zero, the loop pauses.
        </p>
      </section>
    </div>
  );
}
