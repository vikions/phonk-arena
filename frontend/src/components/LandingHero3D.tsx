"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  OrbitControls,
  Sparkles,
  useGLTF,
} from "@react-three/drei";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { HowItWorksModal } from "@/components/HowItWorksModal";

const SOUND_PREF_KEY = "phonk_arena_landing_sound_enabled";
const DEFAULT_VOLUME = 0.35;
const ENTER_TRANSITION_MS = 350;
const TARGET_MODEL_HEIGHT = 2.2;

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

    const suggestedCameraZ = clamp(2.7 + scaledDepth * 0.28, 2.7, 3.3);
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
    const targetY = -0.36 + Math.sin(elapsed * 1.1) * 0.05 + openProgress * 0.03;
    const targetScale = 1 + Math.sin(elapsed * 1.65) * 0.005 + openProgress * 0.1;
    const targetPitch = Math.sin(elapsed * 0.55) * 0.02 + openProgress * THREE.MathUtils.degToRad(3);

    group.position.y = THREE.MathUtils.damp(group.position.y, targetY, 4.2, delta);
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, targetPitch, 3.2, delta);
    group.rotation.y += delta * (0.11 + openProgress * 0.4);

    const scale = THREE.MathUtils.damp(group.scale.x, targetScale, 4.8, delta);
    group.scale.setScalar(scale);
  });

  return (
    <group ref={groupRef} position={[0, -0.36, 0]}>
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
    cam.position.set(0, 0.06, cameraZ);
    cam.lookAt(0, -0.28, 0);
    cam.updateProjectionMatrix();
  }, [camera, cameraZ]);

  return (
    <>
      <ambientLight intensity={0.3} />
      <hemisphereLight args={["#ffe8ff", "#120718", 0.32]} />
      <directionalLight position={[2.3, 2.6, 2.4]} intensity={1.42} color="#ffffff" castShadow />
      <directionalLight position={[-2.5, 1.3, -2.4]} intensity={0.78} color="#8f4bff" />
      <pointLight position={[0, 0.7, -1.9]} intensity={0.68} color="#ff3b7c" />

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
        minPolarAngle={THREE.MathUtils.degToRad(86)}
        maxPolarAngle={THREE.MathUtils.degToRad(94)}
        target={[0, -0.28, 0]}
      />

      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.56}
        scale={4.7}
        blur={2.2}
        far={4}
        color="#170d22"
      />
    </>
  );
}

export function LandingHero3D() {
  const router = useRouter();
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pushTimeoutRef = useRef<number | null>(null);

  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [awaitingInteraction, setAwaitingInteraction] = useState(false);
  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    setAwaitingInteraction(false);
  }, []);

  const startAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = DEFAULT_VOLUME;

    try {
      await audio.play();
      setAwaitingInteraction(false);
    } catch {
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
      stopAudio();
      router.push("/lobbies");
    }, ENTER_TRANSITION_MS);
  }, [leaving, router, stopAudio]);

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

  useEffect(() => {
    if (pathname !== "/") {
      stopAudio();
    }
  }, [pathname, stopAudio]);

  return (
    <section className="relative min-h-[100dvh] overflow-hidden">
      <Canvas
        className="fixed inset-0 z-0"
        style={{ width: "100vw", height: "100vh", background: "transparent" }}
        camera={{ position: [0, 0.06, 2.8], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.18;
        }}
      >
        <Scene openProgress={leaving ? 1 : 0} />
      </Canvas>

      <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(circle_at_50%_42%,rgba(95,47,180,0.24),transparent_45%),radial-gradient(circle_at_50%_34%,rgba(194,52,101,0.24),transparent_36%),radial-gradient(circle_at_50%_82%,rgba(0,0,0,0.45),rgba(0,0,0,0.82)_72%)]" />
      <div className="pointer-events-none fixed inset-0 z-[2] opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.75)_0.45px,transparent_0.45px)] [background-size:3px_3px]" />

      <div
        className={`pointer-events-none fixed inset-0 z-10 flex items-center justify-center px-4 pb-20 pt-24 transition-opacity duration-300 sm:px-6 ${
          leaving ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          className={`w-full max-w-3xl text-center transition-all duration-700 ${
            entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <p className="font-display text-3xl uppercase tracking-[0.2em] text-white sm:text-5xl">
            PHONK ARENA
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.17em] text-white/72 sm:text-sm">
            Autonomous Agents Battling on MONAD
          </p>

          <div className="pointer-events-auto mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleEnterArena}
              disabled={leaving}
              className="w-full max-w-xs rounded-xl border border-cyan-300/70 bg-cyan-300/20 px-6 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 transition hover:bg-cyan-300/35 disabled:opacity-70 sm:text-sm"
            >
              ENTER THE ARENA
            </button>
            <HowItWorksModal
              triggerClassName="w-full max-w-xs rounded-xl border border-white/30 bg-black/35 px-6 py-2.5 text-xs font-semibold text-white/90 transition hover:border-cyan-300/75 hover:text-cyan-100 sm:w-auto sm:text-sm"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleToggleSound}
        aria-pressed={soundEnabled}
        className="pointer-events-auto fixed bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/30 bg-black/45 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/90 backdrop-blur-md transition hover:border-cyan-300/75"
      >
        <SoundIcon enabled={soundEnabled} />
        <span>Sound: {soundEnabled ? "ON" : "OFF"}</span>
      </button>
    </section>
  );
}

useGLTF.preload("/models/matryoshka.glb");
