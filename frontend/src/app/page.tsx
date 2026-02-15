"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { HowItWorksModal } from "@/components/HowItWorksModal";

const SOUND_PREF_KEY = "phonk_arena_landing_sound_enabled";
const DEFAULT_VOLUME = 0.35;
const ENTER_TRANSITION_MS = 320;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function HomePage() {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pushTimeoutRef = useRef<number | null>(null);

  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [awaitingInteraction, setAwaitingInteraction] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setAudioPlaying(false);
    setAwaitingInteraction(false);
  }, []);

  const startAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      await audio.play();
      setAudioPlaying(true);
      setAwaitingInteraction(false);
    } catch {
      setAudioPlaying(false);
      setAwaitingInteraction(true);
    }
  }, []);

  const setSoundPreference = useCallback((enabled: boolean) => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? "1" : "0");
  }, []);

  const handleToggleSound = useCallback(() => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundPreference(next);

    if (next) {
      void startAudio();
      return;
    }

    stopAudio();
  }, [setSoundPreference, soundEnabled, startAudio, stopAudio]);

  const handleEnterArena = useCallback(() => {
    if (leaving) {
      return;
    }

    setLeaving(true);
    pushTimeoutRef.current = window.setTimeout(() => {
      router.push("/lobbies");
    }, ENTER_TRANSITION_MS);
  }, [leaving, router]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setEntered(true);
    });

    return () => {
      window.cancelAnimationFrame(id);
    };
  }, []);

  useEffect(() => {
    const audio = new Audio("/landing/landing-phonk.mp3");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = DEFAULT_VOLUME;
    audioRef.current = audio;

    return () => {
      stopAudio();
      audioRef.current = null;
    };
  }, [stopAudio]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    audioRef.current.volume = clamp(volume, 0, 1);
  }, [volume]);

  useEffect(() => {
    const enabled = window.localStorage.getItem(SOUND_PREF_KEY) === "1";
    setSoundEnabled(enabled);

    if (enabled) {
      void startAudio();
    }
  }, [startAudio]);

  useEffect(() => {
    if (!soundEnabled || !awaitingInteraction) {
      return;
    }

    const unlock = () => {
      void startAudio();
    };

    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, opts);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [awaitingInteraction, soundEnabled, startAudio]);

  useEffect(() => {
    return () => {
      if (pushTimeoutRef.current !== null) {
        window.clearTimeout(pushTimeoutRef.current);
      }
    };
  }, []);

  return (
    <section
      className={`relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0a] px-6 py-10 text-center transition-opacity duration-300 sm:px-10 sm:py-12 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ minHeight: "calc(100dvh - 8rem)" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(225,48,110,0.18),transparent_40%),radial-gradient(circle_at_50%_52%,rgba(115,62,255,0.16),transparent_52%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.75)_0.45px,transparent_0.45px)] [background-size:3px_3px]" />
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
          leaving ? "opacity-20" : "opacity-0"
        } bg-[linear-gradient(0deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)]`}
      />

      <div className="relative mx-auto flex h-full max-w-3xl flex-col items-center justify-center">
        <div
          className={`relative transition-all duration-700 ${
            entered ? "translate-y-0 opacity-100 scale-100" : "translate-y-3 opacity-0 scale-[1.02]"
          } ${leaving ? "scale-[1.08]" : ""}`}
        >
          <div className="pointer-events-none absolute inset-3 -z-10 rounded-full bg-[radial-gradient(circle,rgba(255,68,131,0.32),rgba(109,59,255,0.08)_60%,transparent_75%)] blur-2xl" />
          <Image
            src="/landing/matryoshka.png"
            alt="Matryoshka centerpiece"
            width={460}
            height={460}
            priority
            className="mx-auto h-auto w-[220px] select-none sm:w-[320px] lg:w-[380px]"
          />
        </div>

        <p
          className={`mt-7 font-display text-4xl uppercase tracking-[0.22em] text-white transition-all duration-700 sm:text-6xl ${
            entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          PHONK ARENA
        </p>
        <p className="mt-3 text-sm uppercase tracking-[0.17em] text-white/70 sm:text-base">
          Autonomous Agents Battling On-Chain
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleEnterArena}
            disabled={leaving}
            className="rounded-xl border border-cyan-300/70 bg-cyan-300/20 px-7 py-3 text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/35 disabled:opacity-70"
          >
            ENTER THE ARENA
          </button>
          <HowItWorksModal />
        </div>

        <div className="mt-6 w-full max-w-md rounded-xl border border-white/15 bg-black/35 px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleToggleSound}
              className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/90 transition hover:border-cyan-300/70"
            >
              {soundEnabled ? "Disable Sound" : "Enable Sound"}
            </button>
            <label className="flex items-center gap-2 text-xs text-white/70">
              Volume
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(event) => {
                  const next = clamp(Number(event.target.value) / 100, 0, 1);
                  setVolume(next);
                }}
                className="h-1 w-28 accent-cyan-300"
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-white/65">
            {audioPlaying
              ? "Landing phonk is playing."
              : awaitingInteraction
                ? "Tap once anywhere to unlock audio."
                : "Sound is currently off."}
          </p>
        </div>
      </div>
    </section>
  );
}
