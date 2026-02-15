"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  OrbitControls,
  Sparkles,
  useGLTF,
} from "@react-three/drei";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import * as THREE from "three";

import { HowItWorksModal } from "@/components/HowItWorksModal";

const SOUND_PREF_KEY = "phonk_arena_landing_sound_enabled";
const DEFAULT_VOLUME = 0.35;
const ENTER_TRANSITION_MS = 350;
const TARGET_MODEL_HEIGHT = 2.45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function HologramRing({ openProgress }: { openProgress: number }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (outerRef.current) {
      outerRef.current.rotation.z += delta * (0.2 + openProgress * 0.5);
    }
    if (innerRef.current) {
      innerRef.current.rotation.z -= delta * (0.14 + openProgress * 0.42);
    }
  });

  return (
    <group position={[0, 0.1, 0]}>
      <mesh ref={outerRef} rotation={[Math.PI / 2.8, 0, 0]}>
        <torusGeometry args={[1.14, 0.016, 16, 180]} />
        <meshStandardMaterial
          color="#b24cff"
          emissive="#7c3aed"
          emissiveIntensity={0.28}
          transparent
          opacity={0.28}
          roughness={0.3}
          metalness={0.55}
        />
      </mesh>
      <mesh ref={innerRef} rotation={[Math.PI / 2.8, 0, Math.PI / 7]}>
        <torusGeometry args={[0.96, 0.011, 16, 150]} />
        <meshStandardMaterial
          color="#ff4a8e"
          emissive="#ff0055"
          emissiveIntensity={0.25}
          transparent
          opacity={0.2}
          roughness={0.35}
          metalness={0.48}
        />
      </mesh>
    </group>
  );
}

function MatryoshkaModel({
  openProgress,
  onFit,
}: {
  openProgress: number;
  onFit: (cameraZ: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/matryoshka.glb");

  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const sourceHeight = Math.max(size.y, 0.001);
    const fitScale = TARGET_MODEL_HEIGHT / sourceHeight;
    const scaledDepth = size.z * fitScale;

    model.position.set(-center.x, -center.y, -center.z);
    model.scale.setScalar(fitScale);

    const suggestedCameraZ = clamp(1.25 + scaledDepth * 0.35, 1.28, 1.68);
    onFit(suggestedCameraZ);

    let meshIndex = 0;
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) {
        return;
      }

      obj.castShadow = true;
      obj.receiveShadow = true;

      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((mat) => {
        if (!(mat instanceof THREE.MeshStandardMaterial)) {
          return;
        }

        mat.roughness = clamp(mat.roughness * 0.8, 0.25, 0.55);
        mat.metalness = clamp(mat.metalness + 0.22, 0.35, 0.6);

        const marker = hashString(`${obj.name}-${meshIndex}`);
        const namedAccent = /(eye|trim|line|orn|metal|ring|face)/i.test(obj.name);
        const accent = namedAccent || marker % 5 === 0;
        if (accent) {
          mat.emissive.set(marker % 2 === 0 ? "#7c3aed" : "#ff0055");
          mat.emissiveIntensity = 0.1 + (marker % 3) * 0.03;
        }

        mat.needsUpdate = true;
      });

      meshIndex += 1;
    });
  }, [model, onFit]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const elapsed = state.clock.getElapsedTime();
    const targetY = Math.sin(elapsed * 1.1) * 0.06 + openProgress * 0.04;
    const targetScale = 1 + Math.sin(elapsed * 1.65) * 0.005 + openProgress * 0.1;
    const targetPitch = Math.sin(elapsed * 0.55) * 0.02 + openProgress * THREE.MathUtils.degToRad(3);

    group.position.y = THREE.MathUtils.damp(group.position.y, targetY, 4.2, delta);
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, targetPitch, 3.2, delta);
    group.rotation.y += delta * (0.11 + openProgress * 0.4);

    const scale = THREE.MathUtils.damp(group.scale.x, targetScale, 4.8, delta);
    group.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef} position={[0, -0.12, 0]}>
      <primitive object={model} />
      <HologramRing openProgress={openProgress} />
    </group>
  );
}

function Scene({ openProgress }: { openProgress: number }) {
  const [cameraZ, setCameraZ] = useState(1.5);
  const { camera } = useThree();

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, 0.24, cameraZ);
    cam.lookAt(0, 0.2, 0);
    cam.updateProjectionMatrix();
  }, [camera, cameraZ]);

  return (
    <>
      <ambientLight intensity={0.22} />
      <directionalLight position={[2.3, 2.6, 2.4]} intensity={1.25} color="#ffffff" castShadow />
      <directionalLight position={[-2.5, 1.3, -2.4]} intensity={0.6} color="#8f4bff" />
      <pointLight position={[0, 0.7, -1.9]} intensity={0.52} color="#ff3b7c" />

      <Suspense fallback={null}>
        <MatryoshkaModel openProgress={openProgress} onFit={setCameraZ} />
      </Suspense>

      <Sparkles
        count={20}
        size={1.6}
        speed={0.18}
        opacity={0.16}
        color="#d1a8ff"
        scale={[3.8, 2.6, 2.8]}
      />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        minPolarAngle={THREE.MathUtils.degToRad(62)}
        maxPolarAngle={THREE.MathUtils.degToRad(118)}
        target={[0, 0.2, 0]}
      />

      <ContactShadows
        position={[0, -1.35, 0]}
        opacity={0.62}
        scale={4.5}
        blur={2.2}
        far={4}
        color="#170d22"
      />
    </>
  );
}

export function LandingHero3D() {
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
    <>
      <div className="pointer-events-none fixed inset-0 -z-30 bg-[#060608]" />
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_50%_44%,rgba(95,47,180,0.26),transparent_44%),radial-gradient(circle_at_50%_34%,rgba(194,52,101,0.24),transparent_35%),radial-gradient(circle_at_50%_80%,rgba(0,0,0,0.82),rgba(0,0,0,0.99)_70%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.75)_0.45px,transparent_0.45px)] [background-size:3px_3px]" />

      <section
        className={`fixed inset-x-0 bottom-0 top-14 overflow-hidden px-4 pb-4 pt-1 transition-opacity duration-300 sm:top-16 sm:px-6 lg:px-8 ${
          leaving ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          className={`pointer-events-none absolute inset-0 transition-opacity duration-150 ${
            leaving ? "opacity-20" : "opacity-0"
          } bg-[linear-gradient(0deg,transparent_0%,rgba(255,255,255,0.2)_50%,transparent_100%)]`}
        />

        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-center">
          <div className="flex w-full max-w-5xl flex-col items-center justify-center text-center">
            <div
              className={`relative w-full transition-all duration-700 ${
                entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
            >
              <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,rgba(255,70,145,0.3),rgba(124,62,255,0.2)_58%,transparent_80%)] blur-3xl" />
              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-fuchsia-300/30 bg-black/35 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80 backdrop-blur-md sm:top-4">
                Phonk Arena Artifact MA-01
              </div>
              <div className="h-[44vh] min-h-[250px] w-full sm:h-[60vh] lg:h-[66vh] xl:h-[70vh]">
                <Canvas
                  camera={{ position: [0, 0.24, 1.5], fov: 42 }}
                  dpr={[1, 1.5]}
                  gl={{ alpha: true, antialias: true }}
                  onCreated={({ gl }) => {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                    gl.toneMapping = THREE.ACESFilmicToneMapping;
                    gl.toneMappingExposure = 1.05;
                  }}
                >
                  <Scene openProgress={leaving ? 1 : 0} />
                </Canvas>
              </div>
            </div>

            <p
              className={`-mt-2 font-display text-3xl uppercase tracking-[0.2em] text-white transition-all duration-700 sm:text-5xl ${
                entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
              }`}
            >
              PHONK ARENA
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.17em] text-white/72 sm:text-sm">
              Autonomous Agents Battling On-Chain
            </p>

            <div className="mt-3 w-full max-w-xl rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:px-5">
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
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const next = clamp(Number(event.currentTarget.value) / 100, 0, 1);
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

useGLTF.preload("/models/matryoshka.glb");
