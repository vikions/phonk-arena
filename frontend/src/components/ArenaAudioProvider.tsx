"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SOUND_PREF_KEY = "phonk_arena_landing_sound_enabled";
const DEFAULT_VOLUME = 0.35;
const AMBIENT_AUDIO_SRC = "/landing/landing-phonk.mp3";

interface ArenaAudioContextValue {
  soundEnabled: boolean;
  awaitingInteraction: boolean;
  toggleSound: () => void;
  setPreviewSuppressed: (suppressed: boolean) => void;
}

const ArenaAudioContext = createContext<ArenaAudioContextValue | null>(null);

function SoundIcon({ enabled }: { enabled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {enabled ? (
        <>
          <path d="M16 9.5a4.5 4.5 0 0 1 0 5" />
          <path d="M18.8 7a8 8 0 0 1 0 10" />
        </>
      ) : (
        <path d="M17 9L21 15" />
      )}
    </svg>
  );
}

function shouldPlayAmbientAudio(pathname: string | null): boolean {
  return pathname === "/";
}

function AmbientAudioToggle() {
  const pathname = usePathname();
  const audio = useContext(ArenaAudioContext);

  if (!audio || !shouldPlayAmbientAudio(pathname)) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={audio.toggleSound}
      aria-pressed={audio.soundEnabled}
      className="pointer-events-auto fixed bottom-4 right-4 z-[70] inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/55 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/90 backdrop-blur-md transition hover:border-cyan-300/75 hover:bg-black/70"
    >
      <SoundIcon enabled={audio.soundEnabled} />
      <span>
        Sound: {audio.soundEnabled ? "ON" : "OFF"}
        {audio.awaitingInteraction ? " / Tap" : ""}
      </span>
    </button>
  );
}

export function useArenaAudio() {
  const context = useContext(ArenaAudioContext);
  if (!context) {
    throw new Error("useArenaAudio must be used within ArenaAudioProvider.");
  }

  return context;
}

export function ArenaAudioProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [awaitingInteraction, setAwaitingInteraction] = useState(false);
  const [previewSuppressed, setPreviewSuppressed] = useState(false);

  useEffect(() => {
    const audio = new Audio(AMBIENT_AUDIO_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = DEFAULT_VOLUME;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const storedPreference = window.localStorage.getItem(SOUND_PREF_KEY);
    const enabled = storedPreference === null ? true : storedPreference === "1";
    setSoundEnabled(enabled);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SOUND_PREF_KEY, soundEnabled ? "1" : "0");
  }, [soundEnabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!soundEnabled || previewSuppressed || !shouldPlayAmbientAudio(pathname)) {
      audio.pause();
      setAwaitingInteraction(false);
      return;
    }

    audio.volume = DEFAULT_VOLUME;
    void audio.play().then(
      () => {
        setAwaitingInteraction(false);
      },
      () => {
        setAwaitingInteraction(true);
      },
    );
  }, [pathname, previewSuppressed, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled || !awaitingInteraction) {
      return;
    }

    const unlock = () => {
      const audio = audioRef.current;
      if (!audio || !shouldPlayAmbientAudio(pathname)) {
        return;
      }

      void audio.play().then(
        () => {
          setAwaitingInteraction(false);
        },
        () => {
          setAwaitingInteraction(true);
        },
      );
    };

    const pointerOptions: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener("pointerdown", unlock, pointerOptions);
    window.addEventListener("touchstart", unlock, pointerOptions);
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [awaitingInteraction, pathname, soundEnabled]);

  return (
    <ArenaAudioContext.Provider
      value={{
        soundEnabled,
        awaitingInteraction,
        toggleSound: () => setSoundEnabled((value) => !value),
        setPreviewSuppressed,
      }}
    >
      {children}
      <AmbientAudioToggle />
    </ArenaAudioContext.Provider>
  );
}
