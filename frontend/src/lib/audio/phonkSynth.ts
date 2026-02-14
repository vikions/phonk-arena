import type { AgentStyle } from "@/lib/types";

interface RenderPhonkClipInput {
  seed: string;
  style: AgentStyle;
  intensity: number;
  durationSec?: number;
}

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

function midiToHz(midiNote: number): number {
  return 440 * 2 ** ((midiNote - 69) / 12);
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

function createNoiseBuffer(
  context: OfflineAudioContext,
  durationSec: number,
  rand: () => number,
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    data[i] = rand() * 2 - 1;
  }

  return buffer;
}

function scheduleKick(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  drive: number,
): void {
  const bodyOsc = context.createOscillator();
  bodyOsc.type = "sine";
  bodyOsc.frequency.setValueAtTime(145 + drive * 45, startTime);
  bodyOsc.frequency.exponentialRampToValueAtTime(40 + (1 - drive) * 18, startTime + 0.18);

  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(0.85 + drive * 0.8, startTime);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

  bodyOsc.connect(bodyGain);
  bodyGain.connect(destination);

  bodyOsc.start(startTime);
  bodyOsc.stop(startTime + 0.22);
}

function scheduleSnare(
  context: OfflineAudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  startTime: number,
  drive: number,
): void {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 1000 + drive * 700;

  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.22 + drive * 0.35, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.0005, startTime + 0.16);

  noise.connect(highPass);
  highPass.connect(noiseGain);
  noiseGain.connect(destination);

  const toneOsc = context.createOscillator();
  toneOsc.type = "triangle";
  toneOsc.frequency.setValueAtTime(200 + drive * 30, startTime);

  const toneGain = context.createGain();
  toneGain.gain.setValueAtTime(0.14 + drive * 0.18, startTime);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.13);

  toneOsc.connect(toneGain);
  toneGain.connect(destination);

  noise.start(startTime);
  noise.stop(startTime + 0.2);
  toneOsc.start(startTime);
  toneOsc.stop(startTime + 0.15);
}

function scheduleHat(
  context: OfflineAudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  startTime: number,
  drive: number,
  open = false,
): void {
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandPass = context.createBiquadFilter();
  bandPass.type = "bandpass";
  bandPass.frequency.value = 6900 + drive * 2600;
  bandPass.Q.value = 0.8;

  const gain = context.createGain();
  const attack = open ? 0.004 : 0.001;
  const decay = open ? 0.2 : 0.055;
  const level = open ? 0.09 + drive * 0.12 : 0.05 + drive * 0.08;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(level, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

  noise.connect(bandPass);
  bandPass.connect(gain);
  gain.connect(destination);

  noise.start(startTime);
  noise.stop(startTime + decay + 0.02);
}

function scheduleBass(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  noteHz: number,
  duration: number,
  style: AgentStyle,
  drive: number,
): void {
  const osc = context.createOscillator();
  osc.type = style === "HARD" ? "sawtooth" : "triangle";

  const sub = context.createOscillator();
  sub.type = "sine";

  osc.frequency.setValueAtTime(noteHz * (1 + drive * 0.03), startTime);
  osc.frequency.exponentialRampToValueAtTime(noteHz * 0.56, startTime + duration);
  sub.frequency.setValueAtTime(noteHz * 0.5, startTime);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(220 + drive * 260, startTime);
  filter.frequency.exponentialRampToValueAtTime(100 + drive * 70, startTime + duration);
  filter.Q.value = 1.1 + drive * 1.7;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.24 + drive * 0.28, startTime + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  osc.connect(filter);
  sub.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  osc.start(startTime);
  sub.start(startTime);
  osc.stop(startTime + duration + 0.05);
  sub.stop(startTime + duration + 0.05);
}

function scheduleCowbell(
  context: OfflineAudioContext,
  destination: AudioNode,
  startTime: number,
  noteHz: number,
  drive: number,
): void {
  const oscA = context.createOscillator();
  const oscB = context.createOscillator();
  oscA.type = "square";
  oscB.type = "square";

  oscA.frequency.setValueAtTime(noteHz, startTime);
  oscB.frequency.setValueAtTime(noteHz * (1.46 + drive * 0.08), startTime);

  const bandPass = context.createBiquadFilter();
  bandPass.type = "bandpass";
  bandPass.frequency.value = 1700 + drive * 700;
  bandPass.Q.value = 2.6;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.05 + drive * 0.06, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);

  oscA.connect(bandPass);
  oscB.connect(bandPass);
  bandPass.connect(gain);
  gain.connect(destination);

  oscA.start(startTime);
  oscB.start(startTime);
  oscA.stop(startTime + 0.18);
  oscB.stop(startTime + 0.18);
}

export async function renderPhonkClip({
  seed,
  style,
  intensity,
  durationSec = 10,
}: RenderPhonkClipInput): Promise<AudioBuffer> {
  const drive = clamp(intensity, 0, 1);
  const sampleRate = 44_100;
  const totalFrames = Math.floor(sampleRate * durationSec);
  const context = new OfflineAudioContext(2, totalFrames, sampleRate);

  const rand = mulberry32(hashSeed(`${seed}:${style}:${drive.toFixed(3)}`));

  const master = context.createGain();
  master.gain.value = 0.76 + drive * 0.22;

  const hp = context.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 26;

  const distortion = context.createWaveShaper();
  distortion.curve = createDistortionCurve(45 + drive * 190 + (style === "HARD" ? 30 : 0));
  distortion.oversample = "4x";

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -28 + drive * 4;
  compressor.knee.value = 24;
  compressor.ratio.value = 4 + drive * 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.15;

  const output = context.createGain();
  output.gain.value = 0.95;

  master.connect(hp);
  hp.connect(distortion);
  distortion.connect(compressor);
  compressor.connect(output);
  output.connect(context.destination);

  const drums = context.createGain();
  drums.gain.value = 0.88 + drive * 0.38;
  drums.connect(master);

  const bass = context.createGain();
  bass.gain.value = 0.8 + drive * 0.45;
  bass.connect(master);

  const melody = context.createGain();
  melody.gain.value = style === "HARD" ? 0.34 + drive * 0.22 : 0.3 + drive * 0.16;
  melody.connect(master);

  const noiseShort = createNoiseBuffer(context, 0.24, rand);
  const noiseLong = createNoiseBuffer(context, 0.44, rand);

  const bpmBase = style === "HARD" ? 164 : 142;
  const bpm = bpmBase + drive * 24 + (rand() - 0.5) * 6;
  const step = (60 / bpm) / 2;
  const totalSteps = Math.floor(durationSec / step);

  const rootPool = style === "HARD" ? [39, 41, 43] : [41, 44, 46];
  let rootMidi = rootPool[Math.floor(rand() * rootPool.length)];

  for (let i = 0; i < totalSteps; i += 1) {
    const time = i * step;
    const barStep = i % 16;

    const kickMain = barStep === 0 || barStep === 8 || barStep === 12;
    const kickGhost = (barStep === 5 || barStep === 15) && rand() > 0.52 - drive * 0.3;
    if (kickMain || kickGhost) {
      scheduleKick(context, drums, time, drive);
    }

    if (barStep === 4 || barStep === 12) {
      scheduleSnare(context, drums, noiseLong, time, drive);
    }

    const hatChance = 0.62 + drive * 0.24;
    if (barStep % 2 === 0 || rand() < hatChance) {
      scheduleHat(context, drums, noiseShort, time, drive, false);
    }

    if (barStep === 14 && rand() > 0.45 - drive * 0.2) {
      scheduleHat(context, drums, noiseLong, time, drive, true);
    }

    if (i % 2 === 0) {
      const minorScale = style === "HARD" ? [0, -1, -3, -5, -7] : [0, -2, -3, -5, -7];
      const note = rootMidi + minorScale[Math.floor(rand() * minorScale.length)];
      const duration = step * (style === "HARD" ? 1.6 + drive * 0.6 : 2 + drive * 0.5);
      scheduleBass(context, bass, time, midiToHz(note), duration, style, drive);

      if (rand() > 0.78 - drive * 0.2) {
        const drift = rand() > 0.5 ? 2 : -2;
        rootMidi = Math.min(46, Math.max(36, rootMidi + drift));
      }
    }

    const bellChance = style === "HARD" ? 0.38 + drive * 0.26 : 0.3 + drive * 0.18;
    if (i % 4 === 0 && rand() < bellChance) {
      const bellNote = style === "HARD" ? 71 : 67;
      scheduleCowbell(context, melody, time + rand() * 0.015, midiToHz(bellNote), drive);
    }
  }

  return context.startRendering();
}