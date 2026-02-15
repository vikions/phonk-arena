"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HowItWorksModal } from "@/components/HowItWorksModal";

const SOUND_PREF_KEY = "phonk_arena_landing_sound_enabled";
const DEFAULT_VOLUME = 0.35;
const ENTER_TRANSITION_MS = 320;
const PARALLAX_MAX_PX = 8;

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
  const [parallaxEnabled, setParallaxEnabled] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

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

  const handleParallaxMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!parallaxEnabled || leaving) {
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const normX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const normY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;

      setParallax({
        x: clamp(normX * PARALLAX_MAX_PX, -PARALLAX_MAX_PX, PARALLAX_MAX_PX),
        y: clamp(normY * PARALLAX_MAX_PX, -PARALLAX_MAX_PX, PARALLAX_MAX_PX),
      });
    },
    [leaving, parallaxEnabled],
  );

  const handleParallaxLeave = useCallback(() => {
    setParallax({ x: 0, y: 0 });
  }, []);

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
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(pointer: fine) and (min-width: 768px)");
    const apply = () => setParallaxEnabled(media.matches);
    apply();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }

    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  useEffect(() => {
    return () => {
      if (pushTimeoutRef.current !== null) {
        window.clearTimeout(pushTimeoutRef.current);
      }
    };
  }, []);

  const matryoshkaTransform = useMemo(() => {
    const scale = leaving ? 1.08 : entered ? 1 : 1.02;
    return `translate3d(${parallax.x}px, ${parallax.y}px, 0) scale(${scale})`;
  }, [entered, leaving, parallax.x, parallax.y]);

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-30 bg-[#060608]" />
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_50%_45%,rgba(96,43,181,0.22),transparent_48%),radial-gradient(circle_at_50%_32%,rgba(188,48,98,0.2),transparent_38%),radial-gradient(circle_at_50%_80%,rgba(0,0,0,0.82),rgba(0,0,0,0.98)_70%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.75)_0.45px,transparent_0.45px)] [background-size:3px_3px]" />

      <section
        className={`fixed inset-x-0 bottom-0 top-14 overflow-hidden px-4 pb-4 pt-2 transition-opacity duration-300 sm:top-16 sm:px-6 lg:px-8 ${
          leaving ? "opacity-0" : "opacity-100"
        }`}
        onMouseMove={handleParallaxMove}
        onMouseLeave={handleParallaxLeave}
      >
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
            leaving ? "opacity-20" : "opacity-0"
          } bg-[linear-gradient(0deg,transparent_0%,rgba(255,255,255,0.18)_50%,transparent_100%)]`}
        />

        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-center">
          <div className="flex w-full max-w-3xl flex-col items-center justify-center text-center">
            <div
              className="relative transition-[transform,opacity] duration-700 will-change-transform"
              style={{
                transform: matryoshkaTransform,
                opacity: entered ? 1 : 0,
              }}
            >
              <div className="pointer-events-none absolute inset-4 -z-10 rounded-full bg-[radial-gradient(circle,rgba(255,66,138,0.34),rgba(118,66,255,0.2)_58%,transparent_78%)] blur-3xl" />
              <Image
                src="/landing/matryoshka.png"
                alt="Matryoshka centerpiece"
                width={540}
                height={540}
                priority
                className="h-auto max-h-[38vh] w-auto select-none object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.65)] sm:max-h-[52vh]"
              />
            </div>

            <p
              className={`mt-4 font-display text-3xl uppercase tracking-[0.2em] text-white transition-all duration-700 sm:mt-6 sm:text-5xl ${
                entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
            >
              PHONK ARENA
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.17em] text-white/72 sm:text-sm">
              Autonomous Agents Battling On-Chain
            </p>

            <div className="mt-4 w-full max-w-xl rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:mt-5 sm:px-5">
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleEnterArena}
                  disabled={leaving}
                  className="w-full max-w-xs rounded-xl border border-cyan-300/70 bg-cyan-300/20 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/35 disabled:opacity-70 sm:text-sm"
                >
                  ENTER THE ARENA
                </button>
                <HowItWorksModal />

                <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
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
                      className="h-1 w-24 accent-cyan-300 sm:w-28"
                    />
                  </label>
                </div>

                <p className="text-[11px] text-white/65 sm:text-xs">
                  {audioPlaying
                    ? "Landing phonk is playing."
                    : awaitingInteraction
                      ? "Tap once anywhere to unlock audio."
                      : "Sound is currently off."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
