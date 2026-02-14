import type { AgentStyle } from "@/lib/types";

interface RenderPhonkClipInput {
  seed: string;
  style: AgentStyle;
  intensity: number;
  durationSec?: number;
  bpm?: number;
  mutationLevel?: number;
  patternDensity?: number;
  distortion?: number;
  fxChance?: number;
}

interface SoundManifest {
  kicks: string[];
  snares: string[];
  hats: string[];
  bass: string[];
  fx: string[];
  melodies: string[];
}

type SoundCategory = keyof SoundManifest;

const EMPTY_MANIFEST: SoundManifest = {
  kicks: [],
  snares: [],
  hats: [],
  bass: [],
  fx: [],
  melodies: [],
};

const HARD_HINTS: Record<SoundCategory, string[]> = {
  kicks: ["hard", "808", "dist", "punch", "boom", "phonk"],
  snares: ["snap", "hard", "clap", "crack"],
  hats: ["sharp", "metal", "open", "roll"],
  bass: ["808", "sub", "drive", "hard"],
  fx: ["siren", "impact", "reverse", "noise"],
  melodies: ["bell", "lead", "cowbell", "dark"],
};

const SOFT_HINTS: Record<SoundCategory, string[]> = {
  kicks: ["soft", "round", "warm", "lofi"],
  snares: ["soft", "rim", "brush", "light"],
  hats: ["soft", "closed", "dust", "vinyl"],
  bass: ["smooth", "warm", "sub", "deep"],
  fx: ["air", "pad", "atmo", "rain", "night"],
  melodies: ["pad", "ambient", "dream", "piano", "chill"],
};

let manifestPromise: Promise<SoundManifest> | null = null;
const sampleDataCache = new Map<string, Promise<ArrayBuffer | null>>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashSeed(seed: string): number {
  let h = 2166136261;

  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed;

  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 44_100;
  const curve = new Float32Array(samples) as Float32Array<ArrayBuffer>;
  const k = amount;

  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }

  return curve;
}

function sampleWeight(
  url: string,
  category: SoundCategory,
  style: AgentStyle,
  mutationLevel: number,
  randomBoost: number,
): number {
  const key = url.toLowerCase();
  const hints = style === "HARD" ? HARD_HINTS[category] : SOFT_HINTS[category];

  let score = 1;
  for (const hint of hints) {
    if (key.includes(hint)) {
      score += 1.2;
    }
  }

  return score + mutationLevel * randomBoost;
}

function weightedPick(
  items: string[],
  category: SoundCategory,
  style: AgentStyle,
  rand: () => number,
  mutationLevel: number,
): string | null {
  if (items.length === 0) {
    return null;
  }

  const weighted = items.map((item) => ({
    item,
    weight: sampleWeight(item, category, style, mutationLevel, rand() * 0.9),
  }));

  const totalWeight = weighted.reduce((acc, current) => acc + current.weight, 0);
  let target = rand() * totalWeight;

  for (const entry of weighted) {
    target -= entry.weight;
    if (target <= 0) {
      return entry.item;
    }
  }

  return weighted[weighted.length - 1].item;
}

async function getSoundManifest(): Promise<SoundManifest> {
  if (manifestPromise) {
    return manifestPromise;
  }

  manifestPromise = (async () => {
    try {
      const response = await fetch("/api/sounds", { cache: "no-store" });
      if (!response.ok) {
        return EMPTY_MANIFEST;
      }

      const payload = (await response.json()) as Partial<SoundManifest>;

      return {
        kicks: Array.isArray(payload.kicks) ? payload.kicks : [],
        snares: Array.isArray(payload.snares) ? payload.snares : [],
        hats: Array.isArray(payload.hats) ? payload.hats : [],
        bass: Array.isArray(payload.bass) ? payload.bass : [],
        fx: Array.isArray(payload.fx) ? payload.fx : [],
        melodies: Array.isArray(payload.melodies) ? payload.melodies : [],
      };
    } catch {
      return EMPTY_MANIFEST;
    }
  })();

  return manifestPromise;
}

async function getSampleData(url: string): Promise<ArrayBuffer | null> {
  const existing = sampleDataCache.get(url);
  if (existing) {
    return existing;
  }

  const loader = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }

      return await response.arrayBuffer();
    } catch {
      return null;
    }
  })();

  sampleDataCache.set(url, loader);
  return loader;
}

async function decodeSample(context: OfflineAudioContext, url: string): Promise<AudioBuffer | null> {
  const data = await getSampleData(url);
  if (!data) {
    return null;
  }

  try {
    return await context.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

async function buildPool(
  context: OfflineAudioContext,
  urls: string[],
  category: SoundCategory,
  style: AgentStyle,
  rand: () => number,
  mutationLevel: number,
  targetSize: number,
): Promise<AudioBuffer[]> {
  if (urls.length === 0) {
    return [];
  }

  const selected: string[] = [];
  for (let i = 0; i < targetSize; i += 1) {
    const chosen = weightedPick(urls, category, style, rand, mutationLevel);
    if (chosen) {
      selected.push(chosen);
    }
  }

  const unique = [...new Set(selected)];
  const decoded = await Promise.all(unique.map((url) => decodeSample(context, url)));

  return decoded.filter((buffer): buffer is AudioBuffer => Boolean(buffer));
}

function pickBuffer(pool: AudioBuffer[], rand: () => number): AudioBuffer | null {
  if (pool.length === 0) {
    return null;
  }

  return pool[Math.floor(rand() * pool.length)] ?? null;
}

function scheduleBuffer(
  context: OfflineAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  startTime: number,
  options: {
    gain: number;
    playbackRate: number;
    attack: number;
    release: number;
    maxDuration?: number;
  },
): void {
  const source = context.createBufferSource();
  const gainNode = context.createGain();

  source.buffer = buffer;
  source.playbackRate.value = options.playbackRate;

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.linearRampToValueAtTime(options.gain, startTime + options.attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + options.release);

  source.connect(gainNode);
  gainNode.connect(destination);

  source.start(startTime);

  const stopAt = startTime + (options.maxDuration ?? options.release + 0.05);
  source.stop(stopAt);
}

function midiToHz(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
}

function scheduleFallbackKick(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  drive: number,
): void {
  const osc = context.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150 + drive * 35, startTime);
  osc.frequency.exponentialRampToValueAtTime(45, startTime + 0.16);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.9 + drive * 0.5, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.2);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(startTime);
  osc.stop(startTime + 0.22);
}

function scheduleFallbackSnare(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  rand: () => number,
): void {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.14), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = rand() * 2 - 1;
  }

  const noise = context.createBufferSource();
  noise.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1300;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.24, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  noise.start(startTime);
  noise.stop(startTime + 0.14);
}

function scheduleFallbackHat(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  rand: () => number,
): void {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.06), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = rand() * 2 - 1;
  }

  const noise = context.createBufferSource();
  noise.buffer = buffer;

  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 7200;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.08, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  noise.start(startTime);
  noise.stop(startTime + 0.06);
}

function scheduleFallbackBass(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  noteHz: number,
  duration: number,
  style: AgentStyle,
): void {
  const osc = context.createOscillator();
  osc.type = style === "HARD" ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(noteHz, startTime);

  const sub = context.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(noteHz * 0.5, startTime);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(style === "HARD" ? 220 : 160, startTime);

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.24, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(filter);
  sub.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  osc.start(startTime);
  sub.start(startTime);
  osc.stop(startTime + duration + 0.02);
  sub.stop(startTime + duration + 0.02);
}

export async function renderPhonkClip({
  seed,
  style,
  intensity,
  durationSec = 10,
  bpm,
  mutationLevel,
  patternDensity,
  distortion,
  fxChance,
}: RenderPhonkClipInput): Promise<AudioBuffer> {
  const drive = clamp(intensity, 0, 1);
  const mutation = clamp(mutationLevel ?? 0.5, 0, 1);
  const density = clamp(patternDensity ?? 0.55, 0.15, 1);
  const distortionAmount = clamp(distortion ?? (style === "HARD" ? 0.62 : 0.36), 0.05, 1);
  const fxRatio = clamp(fxChance ?? (style === "HARD" ? 0.2 : 0.45), 0, 1);

  const targetBpm =
    bpm ??
    (style === "HARD"
      ? 154 + drive * 18 + mutation * 10
      : 136 + drive * 12 + mutation * 8);

  const sampleRate = 44_100;
  const totalFrames = Math.max(1, Math.floor(sampleRate * durationSec));
  const context = new OfflineAudioContext(2, totalFrames, sampleRate);

  const rand = mulberry32(
    hashSeed(
      `${seed}:${style}:${drive.toFixed(3)}:${mutation.toFixed(3)}:${density.toFixed(3)}:${Math.round(targetBpm)}`,
    ),
  );

  const manifest = await getSoundManifest();

  const [kickPool, snarePool, hatPool, bassPool, melodyPool, fxPool] = await Promise.all([
    buildPool(context, manifest.kicks, "kicks", style, rand, mutation, 4),
    buildPool(context, manifest.snares, "snares", style, rand, mutation, 4),
    buildPool(context, manifest.hats, "hats", style, rand, mutation, 5),
    buildPool(context, manifest.bass, "bass", style, rand, mutation, 3),
    buildPool(context, manifest.melodies, "melodies", style, rand, mutation, 3),
    buildPool(context, manifest.fx, "fx", style, rand, mutation, 3),
  ]);

  const master = context.createGain();
  master.gain.value = 0.86;

  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 24;

  const waveshaper = context.createWaveShaper();
  waveshaper.curve = createDistortionCurve(35 + distortionAmount * 210 + (style === "HARD" ? 35 : 0));
  waveshaper.oversample = "4x";

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -30 + drive * 4;
  compressor.knee.value = 24;
  compressor.ratio.value = 4 + drive * 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.18;

  master.connect(highpass);
  highpass.connect(waveshaper);
  waveshaper.connect(compressor);
  compressor.connect(context.destination);

  const drums = context.createGain();
  drums.gain.value = 0.9 + drive * 0.25;
  drums.connect(master);

  const bass = context.createGain();
  bass.gain.value = style === "HARD" ? 0.95 + drive * 0.35 : 0.82 + drive * 0.2;
  bass.connect(master);

  const texture = context.createGain();
  texture.gain.value = style === "SOFT" ? 0.55 + fxRatio * 0.25 : 0.35 + fxRatio * 0.2;
  texture.connect(master);

  const step = (60 / targetBpm) / 4;
  const steps = Math.floor(durationSec / step);

  const rootPool = style === "HARD" ? [38, 40, 43] : [40, 43, 45];
  let root = rootPool[Math.floor(rand() * rootPool.length)];

  const hatChance = clamp(0.48 + density * 0.42 + mutation * 0.12, 0.2, 0.98);
  const ghostKickChance = clamp(0.2 + density * 0.26 + mutation * 0.24, 0.05, 0.85);
  const fxChancePerBar = clamp((style === "SOFT" ? 0.34 : 0.2) + fxRatio * 0.4 + mutation * 0.16, 0.05, 0.95);

  for (let i = 0; i < steps; i += 1) {
    const t = i * step;
    const barStep = i % 16;

    const kickMain = barStep === 0 || barStep === 8 || barStep === 12;
    const kickGhost = (barStep === 5 || barStep === 15) && rand() < ghostKickChance;
    if (kickMain || kickGhost) {
      const kick = pickBuffer(kickPool, rand);
      if (kick) {
        scheduleBuffer(context, drums, kick, t, {
          gain: 0.82 + drive * 0.45,
          playbackRate: style === "HARD" ? 0.95 + drive * 0.18 : 0.88 + drive * 0.12,
          attack: 0.001,
          release: 0.19,
          maxDuration: 0.35,
        });
      } else {
        scheduleFallbackKick(context, drums, t, drive);
      }
    }

    if (barStep === 4 || barStep === 12) {
      const snare = pickBuffer(snarePool, rand);
      if (snare) {
        scheduleBuffer(context, drums, snare, t, {
          gain: 0.5 + drive * 0.24,
          playbackRate: 0.92 + rand() * 0.2,
          attack: 0.001,
          release: 0.16,
          maxDuration: 0.25,
        });
      } else {
        scheduleFallbackSnare(context, drums, t, rand);
      }
    }

    if (barStep % 2 === 0 || rand() < hatChance) {
      const hat = pickBuffer(hatPool, rand);
      if (hat) {
        scheduleBuffer(context, drums, hat, t, {
          gain: 0.2 + drive * 0.16,
          playbackRate: 0.98 + rand() * 0.22 + mutation * 0.08,
          attack: 0.001,
          release: 0.07,
          maxDuration: 0.11,
        });
      } else {
        scheduleFallbackHat(context, drums, t, rand);
      }
    }

    if (i % 2 === 0) {
      const bassHit = pickBuffer(bassPool, rand);
      if (bassHit) {
        scheduleBuffer(context, bass, bassHit, t, {
          gain: style === "HARD" ? 0.6 + drive * 0.26 : 0.5 + drive * 0.2,
          playbackRate: style === "HARD" ? 0.86 + drive * 0.3 : 0.75 + drive * 0.22,
          attack: 0.001,
          release: step * (style === "HARD" ? 1.5 : 1.8),
          maxDuration: step * 2,
        });
      } else {
        const scale = style === "HARD" ? [0, -1, -3, -5, -7] : [0, -2, -3, -5, -7];
        const note = root + scale[Math.floor(rand() * scale.length)];
        scheduleFallbackBass(context, bass, t, midiToHz(note), step * 1.6, style);
      }

      if (rand() < 0.22 + mutation * 0.2) {
        root += rand() < 0.5 ? -2 : 2;
        root = Math.max(35, Math.min(47, root));
      }
    }

    if (i % 8 === 0 && rand() < fxChancePerBar) {
      const melodic = pickBuffer(melodyPool, rand);
      if (melodic) {
        scheduleBuffer(context, texture, melodic, t + rand() * 0.02, {
          gain: style === "SOFT" ? 0.38 + fxRatio * 0.2 : 0.24 + fxRatio * 0.16,
          playbackRate: style === "SOFT" ? 0.9 + rand() * 0.18 : 1 + rand() * 0.16,
          attack: 0.004,
          release: step * 5,
          maxDuration: step * 7,
        });
      }

      if (rand() < fxRatio) {
        const fx = pickBuffer(fxPool, rand);
        if (fx) {
          scheduleBuffer(context, texture, fx, t + rand() * 0.04, {
            gain: 0.2 + fxRatio * 0.25,
            playbackRate: 0.88 + rand() * 0.24,
            attack: 0.01,
            release: step * 4,
            maxDuration: step * 6,
          });
        }
      }
    }
  }

  return context.startRendering();
}
