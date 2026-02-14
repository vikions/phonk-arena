import type { AgentId, AgentStrategy, AgentStyle, LobbyId } from "@/lib/types";

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
  lobbyId: LobbyId;
  agentId: AgentId;
  strategy: AgentStrategy;
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

type CategoryNumberMap = Record<SoundCategory, number>;

interface AgentAudioProfile {
  swing: number;
  kickPattern: number[];
  snarePattern: number[];
  hatPattern: number[];
  bassCadence: number;
  melodyCadence: number;
  fxCadence: number;
  preferredHints: Partial<Record<SoundCategory, string[]>>;
  playbackSkew: CategoryNumberMap;
  gainSkew: CategoryNumberMap;
  rootPoolHard: number[];
  rootPoolSoft: number[];
  bassScaleHard: number[];
  bassScaleSoft: number[];
  stereoBias: number;
}

const EMPTY_MANIFEST: SoundManifest = {
  kicks: [],
  snares: [],
  hats: [],
  bass: [],
  fx: [],
  melodies: [],
};

const CATEGORIES: SoundCategory[] = ["kicks", "snares", "hats", "bass", "fx", "melodies"];

const HARD_HINTS: Record<SoundCategory, string[]> = {
  kicks: ["kick", "808", "hard", "disrupted", "neurotic", "lunatic"],
  snares: ["snare", "clap", "rim", "crack"],
  hats: ["hat", "hh", "ride", "shaker", "open"],
  bass: ["808", "bass", "one shot", "disrupted", "neurotic"],
  fx: ["impact", "sweep", "uplifter", "reverse"],
  melodies: ["cowbell", "melody", "phrygian", "loop"],
};

const SOFT_HINTS: Record<SoundCategory, string[]> = {
  kicks: ["old school", "kick", "soft", "lo-fi"],
  snares: ["snare", "clap", "rim", "lo-fi"],
  hats: ["hat", "closed", "vinyl", "dust"],
  bass: ["808", "bass", "warm", "smooth"],
  fx: ["atmo", "vox", "reverse", "sweep down"],
  melodies: ["cowbell", "intro", "melody", "loop"],
};

const BASE_PROFILE_A: AgentAudioProfile = {
  swing: 0.02,
  kickPattern: [0.95, 0.12, 0.18, 0.09, 0.38, 0.08, 0.18, 0.2, 0.92, 0.1, 0.22, 0.18, 0.88, 0.14, 0.24, 0.32],
  snarePattern: [0.03, 0.06, 0.08, 0.08, 0.9, 0.08, 0.12, 0.12, 0.05, 0.09, 0.12, 0.12, 0.94, 0.12, 0.18, 0.14],
  hatPattern: [0.7, 0.35, 0.78, 0.38, 0.78, 0.36, 0.84, 0.42, 0.76, 0.4, 0.84, 0.45, 0.88, 0.4, 0.9, 0.55],
  bassCadence: 2,
  melodyCadence: 8,
  fxCadence: 16,
  preferredHints: {
    kicks: ["disrupted", "lunatic", "kick"],
    snares: ["snare", "clap", "disrupted"],
    bass: ["808", "bass", "disrupted"],
    fx: ["impact", "uplifter"],
    melodies: ["cowbell", "melody"],
  },
  playbackSkew: {
    kicks: 1.02,
    snares: 1,
    hats: 1.03,
    bass: 0.95,
    fx: 1,
    melodies: 1,
  },
  gainSkew: {
    kicks: 1.1,
    snares: 1,
    hats: 0.9,
    bass: 1.08,
    fx: 0.8,
    melodies: 0.82,
  },
  rootPoolHard: [37, 39, 41],
  rootPoolSoft: [40, 41, 43],
  bassScaleHard: [0, -1, -3, -5, -7],
  bassScaleSoft: [0, -2, -3, -5, -7],
  stereoBias: -0.12,
};

const BASE_PROFILE_B: AgentAudioProfile = {
  swing: 0.08,
  kickPattern: [0.86, 0.08, 0.36, 0.08, 0.2, 0.34, 0.08, 0.28, 0.72, 0.08, 0.4, 0.08, 0.44, 0.34, 0.08, 0.5],
  snarePattern: [0.04, 0.08, 0.1, 0.08, 0.74, 0.08, 0.34, 0.08, 0.08, 0.08, 0.1, 0.08, 0.8, 0.08, 0.42, 0.08],
  hatPattern: [0.58, 0.5, 0.66, 0.52, 0.68, 0.54, 0.72, 0.6, 0.66, 0.56, 0.74, 0.62, 0.72, 0.58, 0.8, 0.68],
  bassCadence: 3,
  melodyCadence: 6,
  fxCadence: 12,
  preferredHints: {
    kicks: ["neurotic", "old school", "kick"],
    snares: ["lo-fi", "rim", "clap", "snare"],
    bass: ["bass", "one shot", "808"],
    fx: ["atmo", "reverse", "vox", "sweep"],
    melodies: ["intro", "cowbell", "phrygian"],
  },
  playbackSkew: {
    kicks: 0.96,
    snares: 1.02,
    hats: 1.08,
    bass: 0.9,
    fx: 0.96,
    melodies: 0.94,
  },
  gainSkew: {
    kicks: 0.9,
    snares: 1.02,
    hats: 1.06,
    bass: 0.95,
    fx: 1.05,
    melodies: 1.06,
  },
  rootPoolHard: [39, 42, 44],
  rootPoolSoft: [41, 44, 46],
  bassScaleHard: [0, -2, -3, -5, -8],
  bassScaleSoft: [0, -2, -4, -5, -7],
  stereoBias: 0.12,
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

function cloneProfile(profile: AgentAudioProfile): AgentAudioProfile {
  return {
    swing: profile.swing,
    kickPattern: [...profile.kickPattern],
    snarePattern: [...profile.snarePattern],
    hatPattern: [...profile.hatPattern],
    bassCadence: profile.bassCadence,
    melodyCadence: profile.melodyCadence,
    fxCadence: profile.fxCadence,
    preferredHints: {
      kicks: [...(profile.preferredHints.kicks ?? [])],
      snares: [...(profile.preferredHints.snares ?? [])],
      hats: [...(profile.preferredHints.hats ?? [])],
      bass: [...(profile.preferredHints.bass ?? [])],
      fx: [...(profile.preferredHints.fx ?? [])],
      melodies: [...(profile.preferredHints.melodies ?? [])],
    },
    playbackSkew: { ...profile.playbackSkew },
    gainSkew: { ...profile.gainSkew },
    rootPoolHard: [...profile.rootPoolHard],
    rootPoolSoft: [...profile.rootPoolSoft],
    bassScaleHard: [...profile.bassScaleHard],
    bassScaleSoft: [...profile.bassScaleSoft],
    stereoBias: profile.stereoBias,
  };
}

function offsetPattern(pattern: number[], delta: number): number[] {
  return pattern.map((value) => clamp(value + delta, 0.03, 0.98));
}

function jitterPattern(pattern: number[], amount: number, rand: () => number): number[] {
  return pattern.map((value) => clamp(value + (rand() - 0.5) * amount, 0.03, 0.98));
}

function adjustCategoryMap(map: CategoryNumberMap, category: SoundCategory, delta: number): CategoryNumberMap {
  return {
    ...map,
    [category]: clamp(map[category] + delta, 0.45, 1.7),
  };
}

function resolveProfile(
  lobbyId: LobbyId,
  agentId: AgentId,
  strategy: AgentStrategy,
  style: AgentStyle,
  mutation: number,
  rand: () => number,
): AgentAudioProfile {
  let profile = cloneProfile(agentId === "A" ? BASE_PROFILE_A : BASE_PROFILE_B);

  if (lobbyId === "drift-hard") {
    profile.kickPattern = offsetPattern(profile.kickPattern, 0.08);
    profile.snarePattern = offsetPattern(profile.snarePattern, 0.05);
    profile.hatPattern = offsetPattern(profile.hatPattern, 0.02);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "kicks", 0.08);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "bass", 0.08);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "fx", -0.12);
    profile.melodyCadence += 2;
    profile.fxCadence += 2;
    profile.preferredHints.kicks = [...(profile.preferredHints.kicks ?? []), "disrupted", "kick"];
  }

  if (lobbyId === "soft-night") {
    profile.swing = clamp(profile.swing + 0.05, -0.2, 0.2);
    profile.kickPattern = offsetPattern(profile.kickPattern, -0.1);
    profile.snarePattern = offsetPattern(profile.snarePattern, -0.04);
    profile.hatPattern = offsetPattern(profile.hatPattern, 0.04);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "kicks", -0.08);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "melodies", 0.12);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "fx", 0.14);
    profile.bassCadence += 1;
    profile.preferredHints.fx = [...(profile.preferredHints.fx ?? []), "atmo", "vox"];
    profile.preferredHints.melodies = [...(profile.preferredHints.melodies ?? []), "intro", "loop"];
  }

  if (lobbyId === "chaos-lab") {
    const chaosAmount = 0.16 + mutation * 0.2;
    profile.kickPattern = jitterPattern(profile.kickPattern, chaosAmount, rand);
    profile.snarePattern = jitterPattern(profile.snarePattern, chaosAmount, rand);
    profile.hatPattern = jitterPattern(profile.hatPattern, chaosAmount, rand);
    profile.swing = clamp(profile.swing + (rand() - 0.5) * 0.18, -0.2, 0.2);
    profile.bassCadence = Math.max(1, profile.bassCadence + (rand() > 0.5 ? -1 : 1));
    profile.melodyCadence = Math.max(3, profile.melodyCadence + (rand() > 0.5 ? -2 : 2));
    profile.fxCadence = Math.max(4, profile.fxCadence + (rand() > 0.5 ? -3 : 1));
    profile.preferredHints.fx = [...(profile.preferredHints.fx ?? []), "reverse", "impact", "sweep"];
  }

  if (strategy === "AGGRESSIVE") {
    profile.kickPattern = offsetPattern(profile.kickPattern, 0.08);
    profile.snarePattern = offsetPattern(profile.snarePattern, 0.03);
    profile.bassCadence = Math.max(1, profile.bassCadence - 1);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "kicks", 0.07);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "bass", 0.09);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "melodies", -0.08);
  }

  if (strategy === "ADAPTIVE") {
    profile.hatPattern = offsetPattern(profile.hatPattern, 0.05);
    profile.melodyCadence = Math.max(3, profile.melodyCadence - 1);
    profile.fxCadence = Math.max(5, profile.fxCadence - 1);
    profile.preferredHints.fx = [...(profile.preferredHints.fx ?? []), "reverse", "sweep"];
  }

  if (strategy === "SAFE") {
    profile.swing = clamp(profile.swing - 0.03, -0.2, 0.2);
    profile.kickPattern = offsetPattern(profile.kickPattern, -0.05);
    profile.snarePattern = offsetPattern(profile.snarePattern, -0.03);
    profile.hatPattern = offsetPattern(profile.hatPattern, -0.02);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "fx", 0.08);
    profile.gainSkew = adjustCategoryMap(profile.gainSkew, "kicks", -0.04);
  }

  if (style === "HARD") {
    profile.kickPattern = offsetPattern(profile.kickPattern, 0.04);
    profile.bassCadence = Math.max(1, profile.bassCadence - 1);
    profile.preferredHints.bass = [...(profile.preferredHints.bass ?? []), "808"];
  } else {
    profile.kickPattern = offsetPattern(profile.kickPattern, -0.04);
    profile.melodyCadence = Math.max(3, profile.melodyCadence - 1);
    profile.preferredHints.fx = [...(profile.preferredHints.fx ?? []), "atmo", "vox"];
  }

  profile.stereoBias = clamp(profile.stereoBias + (rand() - 0.5) * 0.05, -0.35, 0.35);

  return profile;
}

function sampleWeight(
  url: string,
  category: SoundCategory,
  style: AgentStyle,
  profile: AgentAudioProfile,
  mutationLevel: number,
  randomBoost: number,
): number {
  const key = url.toLowerCase();
  const styleHints = style === "HARD" ? HARD_HINTS[category] : SOFT_HINTS[category];
  const profileHints = profile.preferredHints[category] ?? [];

  let score = 1;

  for (const hint of styleHints) {
    if (key.includes(hint)) {
      score += 0.95;
    }
  }

  for (const hint of profileHints) {
    if (key.includes(hint)) {
      score += 1.25;
    }
  }

  return score + mutationLevel * randomBoost;
}

function weightedPick(
  items: string[],
  category: SoundCategory,
  style: AgentStyle,
  profile: AgentAudioProfile,
  rand: () => number,
  mutationLevel: number,
): string | null {
  if (items.length === 0) {
    return null;
  }

  const weighted = items.map((item) => ({
    item,
    weight: sampleWeight(item, category, style, profile, mutationLevel, rand() * 0.95),
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
  profile: AgentAudioProfile,
  rand: () => number,
  mutationLevel: number,
  targetSize: number,
): Promise<AudioBuffer[]> {
  if (urls.length === 0) {
    return [];
  }

  const selected: string[] = [];
  for (let i = 0; i < targetSize; i += 1) {
    const chosen = weightedPick(urls, category, style, profile, rand, mutationLevel);
    if (chosen) {
      selected.push(chosen);
    }
  }

  const unique = [...new Set(selected)];
  const decoded = await Promise.all(unique.map((url) => decodeSample(context, url)));

  return decoded.filter((buffer): buffer is AudioBuffer => Boolean(buffer));
}

function pickBuffer(
  pool: AudioBuffer[],
  rand: () => number,
  category: SoundCategory,
  state: Partial<Record<SoundCategory, number>>,
): AudioBuffer | null {
  if (pool.length === 0) {
    return null;
  }

  let index = Math.floor(rand() * pool.length);
  const previous = state[category];

  if (pool.length > 1 && typeof previous === "number" && index === previous) {
    index = (index + 1 + Math.floor(rand() * (pool.length - 1))) % pool.length;
  }

  state[category] = index;
  return pool[index] ?? null;
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
  lobbyId,
  agentId,
  strategy,
}: RenderPhonkClipInput): Promise<AudioBuffer> {
  const drive = clamp(intensity, 0, 1);
  const mutation = clamp(mutationLevel ?? 0.5, 0, 1);
  const density = clamp(patternDensity ?? 0.55, 0.15, 1);

  const seededRand = mulberry32(
    hashSeed(
      `${seed}:${lobbyId}:${agentId}:${strategy}:${style}:${drive.toFixed(3)}:${mutation.toFixed(3)}:${density.toFixed(3)}`,
    ),
  );

  const profile = resolveProfile(lobbyId, agentId, strategy, style, mutation, seededRand);
  const distortionAmount = clamp(
    distortion ?? (style === "HARD" ? 0.62 : 0.36) + (strategy === "AGGRESSIVE" ? 0.08 : 0),
    0.05,
    1,
  );
  const fxRatio = clamp(
    fxChance ?? (style === "HARD" ? 0.2 : 0.45) + (agentId === "B" ? 0.06 : -0.02),
    0,
    1,
  );

  const lobbyBpmBias = lobbyId === "drift-hard" ? 8 : lobbyId === "soft-night" ? -9 : 2;
  const targetBpm =
    bpm ??
    (style === "HARD"
      ? 154 + drive * 18 + mutation * 10 + lobbyBpmBias
      : 136 + drive * 12 + mutation * 8 + lobbyBpmBias);

  const sampleRate = 44_100;
  const totalFrames = Math.max(1, Math.floor(sampleRate * durationSec));
  const context = new OfflineAudioContext(2, totalFrames, sampleRate);

  const manifest = await getSoundManifest();

  const [kickPool, snarePool, hatPool, bassPool, melodyPool, fxPool] = await Promise.all([
    buildPool(context, manifest.kicks, "kicks", style, profile, seededRand, mutation, 6),
    buildPool(context, manifest.snares, "snares", style, profile, seededRand, mutation, 6),
    buildPool(context, manifest.hats, "hats", style, profile, seededRand, mutation, 6),
    buildPool(context, manifest.bass, "bass", style, profile, seededRand, mutation, 4),
    buildPool(context, manifest.melodies, "melodies", style, profile, seededRand, mutation, 5),
    buildPool(context, manifest.fx, "fx", style, profile, seededRand, mutation, 4),
  ]);

  const master = context.createGain();
  master.gain.value = 0.86;

  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 24;

  const waveshaper = context.createWaveShaper();
  waveshaper.curve = createDistortionCurve(35 + distortionAmount * 205 + (style === "HARD" ? 35 : 0));
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
  drums.gain.value = (0.9 + drive * 0.25) * profile.gainSkew.kicks;

  const drumsPan = context.createStereoPanner();
  drumsPan.pan.value = profile.stereoBias * 0.5;

  drums.connect(drumsPan);
  drumsPan.connect(master);

  const hatsBus = context.createGain();
  hatsBus.gain.value = (0.84 + density * 0.32) * profile.gainSkew.hats;

  const hatsFilter = context.createBiquadFilter();
  hatsFilter.type = "highpass";
  hatsFilter.frequency.value = style === "HARD" ? 3600 : 4400;
  hatsFilter.Q.value = 0.7;

  hatsBus.connect(hatsFilter);
  hatsFilter.connect(drums);

  const bass = context.createGain();
  bass.gain.value = (style === "HARD" ? 0.95 + drive * 0.35 : 0.82 + drive * 0.2) * profile.gainSkew.bass;

  const bassPan = context.createStereoPanner();
  bassPan.pan.value = -profile.stereoBias * 0.18;

  bass.connect(bassPan);
  bassPan.connect(master);

  const texture = context.createGain();
  texture.gain.value =
    (style === "SOFT" ? 0.55 + fxRatio * 0.25 : 0.35 + fxRatio * 0.2) *
    profile.gainSkew.melodies;

  const texturePan = context.createStereoPanner();
  texturePan.pan.value = profile.stereoBias;

  texture.connect(texturePan);
  texturePan.connect(master);

  const baseStep = (60 / targetBpm) / 4;
  const steps = Math.floor(durationSec / baseStep);

  const rootPool = style === "HARD" ? profile.rootPoolHard : profile.rootPoolSoft;
  const scale = style === "HARD" ? profile.bassScaleHard : profile.bassScaleSoft;

  let root = rootPool[Math.floor(seededRand() * rootPool.length)] ?? 40;

  const pickState: Partial<Record<SoundCategory, number>> = {};

  for (let i = 0; i < steps; i += 1) {
    const swingOffset = i % 2 === 1 ? baseStep * profile.swing : 0;
    const t = i * baseStep + swingOffset;

    if (t >= durationSec) {
      continue;
    }

    const barStep = i % 16;

    const kickProb = clamp(profile.kickPattern[barStep] * (0.52 + density * 0.62 + drive * 0.28), 0.03, 0.99);
    const snareProb = clamp(profile.snarePattern[barStep] * (0.55 + density * 0.46 + mutation * 0.16), 0.03, 0.99);
    const hatProb = clamp(profile.hatPattern[barStep] * (0.58 + density * 0.74 + mutation * 0.15), 0.06, 0.99);

    if (seededRand() < kickProb) {
      const kick = pickBuffer(kickPool, seededRand, "kicks", pickState);
      if (kick) {
        scheduleBuffer(context, drums, kick, t, {
          gain: (0.74 + drive * 0.34) * profile.gainSkew.kicks,
          playbackRate: clamp(
            (style === "HARD" ? 0.94 + drive * 0.2 : 0.88 + drive * 0.15) *
              profile.playbackSkew.kicks *
              (1 + (seededRand() - 0.5) * 0.05),
            0.55,
            1.7,
          ),
          attack: 0.001,
          release: 0.19,
          maxDuration: 0.35,
        });
      } else {
        scheduleFallbackKick(context, drums, t, drive);
      }
    }

    const strongBackbeat = barStep === 4 || barStep === 12;
    if (strongBackbeat || seededRand() < snareProb) {
      const snare = pickBuffer(snarePool, seededRand, "snares", pickState);
      if (snare) {
        scheduleBuffer(context, drums, snare, t, {
          gain: (strongBackbeat ? 0.6 : 0.42) * profile.gainSkew.snares,
          playbackRate: clamp(
            (0.9 + seededRand() * 0.25) * profile.playbackSkew.snares,
            0.6,
            1.8,
          ),
          attack: 0.001,
          release: 0.16,
          maxDuration: 0.25,
        });
      } else {
        scheduleFallbackSnare(context, drums, t, seededRand);
      }
    }

    if (seededRand() < hatProb) {
      const hat = pickBuffer(hatPool, seededRand, "hats", pickState);
      if (hat) {
        scheduleBuffer(context, hatsBus, hat, t, {
          gain: (0.18 + drive * 0.16) * profile.gainSkew.hats,
          playbackRate: clamp(
            (0.96 + seededRand() * 0.24 + mutation * 0.08) * profile.playbackSkew.hats,
            0.75,
            2,
          ),
          attack: 0.001,
          release: 0.06,
          maxDuration: 0.1,
        });
      } else {
        scheduleFallbackHat(context, hatsBus, t, seededRand);
      }

      if ((barStep === 7 || barStep === 15) && seededRand() < 0.3 + mutation * 0.25) {
        const stutterOffset = baseStep * (0.2 + seededRand() * 0.18);
        if (t + stutterOffset < durationSec) {
          if (hat) {
            scheduleBuffer(context, hatsBus, hat, t + stutterOffset, {
              gain: (0.12 + drive * 0.12) * profile.gainSkew.hats,
              playbackRate: clamp(1.15 + seededRand() * 0.35, 0.75, 2.2),
              attack: 0.001,
              release: 0.04,
              maxDuration: 0.07,
            });
          } else {
            scheduleFallbackHat(context, hatsBus, t + stutterOffset, seededRand);
          }
        }
      }
    }

    const bassTrigger = i % profile.bassCadence === 0 || (mutation > 0.72 && i % 2 === 0 && seededRand() < 0.26);
    if (bassTrigger) {
      const bassHit = pickBuffer(bassPool, seededRand, "bass", pickState);
      if (bassHit) {
        scheduleBuffer(context, bass, bassHit, t, {
          gain: (style === "HARD" ? 0.55 + drive * 0.28 : 0.48 + drive * 0.22) * profile.gainSkew.bass,
          playbackRate: clamp(
            (style === "HARD" ? 0.84 + drive * 0.3 : 0.74 + drive * 0.23) *
              profile.playbackSkew.bass *
              (1 + (seededRand() - 0.5) * 0.06),
            0.5,
            1.6,
          ),
          attack: 0.001,
          release: baseStep * (style === "HARD" ? 1.6 : 1.9),
          maxDuration: baseStep * 2.2,
        });
      } else {
        const note = root + (scale[Math.floor(seededRand() * scale.length)] ?? 0);
        scheduleFallbackBass(context, bass, t, midiToHz(note), baseStep * 1.8, style);
      }

      if (seededRand() < 0.15 + mutation * 0.24 + (lobbyId === "chaos-lab" ? 0.12 : 0)) {
        const drift = seededRand() < 0.5 ? -2 : 2;
        root = clamp(root + drift, 34, 50);
      }
    }

    const melodyTrigger = i % profile.melodyCadence === 0 && seededRand() < clamp(0.2 + fxRatio * 0.35 + mutation * 0.2, 0.05, 0.95);
    if (melodyTrigger) {
      const melodic = pickBuffer(melodyPool, seededRand, "melodies", pickState);
      if (melodic) {
        scheduleBuffer(context, texture, melodic, t + seededRand() * 0.03, {
          gain: (style === "SOFT" ? 0.38 + fxRatio * 0.2 : 0.24 + fxRatio * 0.16) * profile.gainSkew.melodies,
          playbackRate: clamp(
            (style === "SOFT" ? 0.88 + seededRand() * 0.2 : 0.98 + seededRand() * 0.18) *
              profile.playbackSkew.melodies,
            0.55,
            1.6,
          ),
          attack: 0.004,
          release: baseStep * (4.8 + seededRand() * 1.2),
          maxDuration: baseStep * 7,
        });
      }
    }

    const fxTrigger = i % profile.fxCadence === 0 && seededRand() < clamp(0.12 + fxRatio * 0.42 + mutation * 0.22, 0.03, 0.95);
    if (fxTrigger) {
      const fx = pickBuffer(fxPool, seededRand, "fx", pickState);
      if (fx) {
        scheduleBuffer(context, texture, fx, t + seededRand() * 0.05, {
          gain: (0.18 + fxRatio * 0.22) * profile.gainSkew.fx,
          playbackRate: clamp((0.86 + seededRand() * 0.26) * profile.playbackSkew.fx, 0.5, 1.8),
          attack: 0.01,
          release: baseStep * (3.6 + seededRand() * 1.4),
          maxDuration: baseStep * 6.2,
        });
      }
    }

    if (lobbyId === "chaos-lab" && seededRand() < 0.06 + mutation * 0.14) {
      const chaosHit = pickBuffer(melodyPool, seededRand, "melodies", pickState);
      if (chaosHit) {
        scheduleBuffer(context, texture, chaosHit, t + baseStep * 0.12, {
          gain: (0.15 + mutation * 0.2) * profile.gainSkew.melodies,
          playbackRate: clamp(1.25 + seededRand() * 0.6, 0.6, 2.2),
          attack: 0.001,
          release: baseStep * 1.2,
          maxDuration: baseStep * 1.7,
        });
      }
    }
  }

  return context.startRendering();
}
