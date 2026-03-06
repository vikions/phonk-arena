import * as Tone from "tone";

import type { InkToken } from "@/lib/tokenDiscovery";

export interface AgentDNA {
  bpmRange: number;
  layerDensity: number;
  glitchIntensity: number;
  bassWeight: number;
  mutationVersion: number;
}

// Default DNA per agent (used until contract returns real values).
export const DEFAULT_DNA: Record<number, AgentDNA> = {
  0: { bpmRange: 150, layerDensity: 8, glitchIntensity: 9, bassWeight: 9, mutationVersion: 0 },
  1: { bpmRange: 130, layerDensity: 6, glitchIntensity: 4, bassWeight: 7, mutationVersion: 0 },
  2: { bpmRange: 128, layerDensity: 5, glitchIntensity: 2, bassWeight: 6, mutationVersion: 0 },
  3: { bpmRange: 140, layerDensity: 7, glitchIntensity: 8, bassWeight: 5, mutationVersion: 0 },
};

export function buildSoundParams(token: InkToken, dna: AgentDNA) {
  const priceNorm = Math.min(Math.abs(token.priceChange24h) / 100, 1);
  const volumeNorm = Math.min(token.volume24h / 1_000_000, 1);

  return {
    bpm: dna.bpmRange + Math.floor(priceNorm * 30),
    reverbWet: parseFloat((1 - volumeNorm).toFixed(2)),
    distortion: parseFloat(((dna.glitchIntensity / 10) * priceNorm).toFixed(2)),
    bassFreq: 40 + (dna.bassWeight / 10) * 60,
    layerCount: Math.max(1, Math.ceil(dna.layerDensity * volumeNorm)),
    filterCutoff: 200 + priceNorm * 800,
  };
}

export async function generateAgentTrack(token: InkToken, dna: AgentDNA) {
  await Tone.start();
  const params = buildSoundParams(token, dna);

  Tone.getTransport().stop();
  Tone.getTransport().cancel(0);
  Tone.getTransport().bpm.value = params.bpm;

  const reverb = new Tone.Reverb(params.reverbWet * 4).toDestination();
  const dist = new Tone.Distortion(params.distortion).connect(reverb);
  const filter = new Tone.Filter(params.filterCutoff, "lowpass").connect(dist);

  const bass = new Tone.Synth({
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 },
  }).connect(filter);

  const pattern = new Tone.Sequence(
    (time, note) => {
      if (note) {
        bass.triggerAttackRelease(note, "8n", time);
      }
    },
    ["C1", null, "C1", null, "G1", null, "C1", "A#1"],
    "8n",
  );

  pattern.start(0);
  Tone.getTransport().start();

  return {
    params,
    stop: () => {
      pattern.stop();
      pattern.dispose();
      Tone.getTransport().stop();
      Tone.getTransport().cancel(0);
      bass.dispose();
      filter.dispose();
      dist.dispose();
      reverb.dispose();
    },
  };
}
