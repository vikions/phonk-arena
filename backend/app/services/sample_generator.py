"""
Synthesize phonk-style samples programmatically using numpy.

Generates kick, snare, hi-hat, 808 bass, cowbell, vocal chop approximations,
melody stabs, and FX risers. All samples are created in-memory or saved as WAV.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from scipy.io import wavfile

SAMPLE_RATE = 44100


def _normalize(signal: np.ndarray) -> np.ndarray:
    peak = np.max(np.abs(signal))
    if peak == 0:
        return signal
    return signal / peak


def _to_int16(signal: np.ndarray) -> np.ndarray:
    return (np.clip(signal, -1, 1) * 32767).astype(np.int16)


def _apply_envelope(signal: np.ndarray, attack: float = 0.005, decay: float = 0.0,
                    sustain: float = 1.0, release: float = 0.05) -> np.ndarray:
    """Simple ADSR envelope."""
    n = len(signal)
    env = np.ones(n)
    a_samples = int(attack * SAMPLE_RATE)
    r_samples = int(release * SAMPLE_RATE)
    d_samples = int(decay * SAMPLE_RATE)

    # Attack
    if a_samples > 0:
        env[:a_samples] = np.linspace(0, 1, a_samples)

    # Decay to sustain
    if d_samples > 0 and a_samples + d_samples < n:
        env[a_samples:a_samples + d_samples] = np.linspace(1, sustain, d_samples)
        env[a_samples + d_samples:-r_samples if r_samples > 0 else n] = sustain

    # Release
    if r_samples > 0:
        env[-r_samples:] = np.linspace(env[-r_samples] if r_samples < n else sustain, 0, r_samples)

    return signal * env


# --- Drum sounds ---

def synth_kick(duration: float = 0.3) -> np.ndarray:
    """808-style kick with pitch sweep."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    # Pitch drops from 150Hz to 40Hz
    freq = 150 * np.exp(-t * 15) + 40
    phase = 2 * np.pi * np.cumsum(freq) / SAMPLE_RATE
    signal = np.sin(phase)
    # Amplitude envelope
    env = np.exp(-t * 10)
    return _normalize(signal * env)


def synth_snare(duration: float = 0.2) -> np.ndarray:
    """Snare with tonal body + noise."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    # Tonal body (200Hz)
    tone = np.sin(2 * np.pi * 200 * t) * np.exp(-t * 20)
    # Noise burst
    noise = np.random.randn(n) * np.exp(-t * 15)
    signal = tone * 0.5 + noise * 0.5
    return _normalize(signal)


def synth_hihat(duration: float = 0.05, open_hat: bool = False) -> np.ndarray:
    """Hi-hat from filtered noise."""
    dur = duration if not open_hat else duration * 4
    n = int(dur * SAMPLE_RATE)
    t = np.linspace(0, dur, n, endpoint=False)
    noise = np.random.randn(n)
    # High-pass effect via differentiation
    hp = np.diff(noise, prepend=0)
    hp = np.diff(hp, prepend=0)
    decay_rate = 20 if not open_hat else 5
    env = np.exp(-t * decay_rate)
    return _normalize(hp * env)


# --- Bass ---

def synth_808_bass(note_freq: float = 40, duration: float = 0.8, distortion: float = 0.0) -> np.ndarray:
    """808-style sub bass with optional distortion."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    signal = np.sin(2 * np.pi * note_freq * t)
    # Add harmonics for grit
    signal += 0.3 * np.sin(2 * np.pi * note_freq * 2 * t)
    signal += 0.15 * np.sin(2 * np.pi * note_freq * 3 * t)
    if distortion > 0:
        signal = np.tanh(signal * (1 + distortion * 5))
    env = np.ones(n)
    release = int(0.1 * SAMPLE_RATE)
    if release < n:
        env[-release:] = np.linspace(1, 0, release)
    return _normalize(signal * env)


# --- Cowbell ---

def synth_cowbell(duration: float = 0.15) -> np.ndarray:
    """Classic TR-808 style cowbell (two square-ish oscillators)."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    # Two detuned square-ish waves at 540Hz and 800Hz
    osc1 = np.sign(np.sin(2 * np.pi * 540 * t))
    osc2 = np.sign(np.sin(2 * np.pi * 800 * t))
    signal = (osc1 + osc2) * 0.5
    # Bandpass-ish (soften with tanh)
    signal = np.tanh(signal * 0.7)
    env = np.exp(-t * 20)
    return _normalize(signal * env)


# --- Vocal chop approximations ---

def synth_vocal_chop(style: str = "memphis", duration: float = 0.4) -> np.ndarray:
    """Synthesize a vocal-like formant chop."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)

    formant_profiles = {
        "aggressive": (120, [700, 1200, 2600]),
        "memphis": (150, [500, 1500, 2500]),
        "minimal": (100, [600, 1800, 3000]),
        "dark": (80, [400, 1000, 2200]),
        "melodic": (200, [550, 1400, 2800]),
    }
    f0, formants = formant_profiles.get(style, formant_profiles["memphis"])

    # Glottal pulse (sawtooth-like)
    source = 2 * (t * f0 % 1) - 1
    # Add formant resonances
    signal = np.zeros(n)
    for fc in formants:
        bw = fc * 0.1
        resonance = np.sin(2 * np.pi * fc * t) * np.exp(-bw * t * 0.5)
        signal += resonance * 0.3
    signal += source * 0.4
    signal = _apply_envelope(signal, attack=0.01, release=0.08)
    return _normalize(signal)


# --- Melody ---

def synth_melody_stab(freq: float = 440, duration: float = 0.3, wave: str = "saw") -> np.ndarray:
    """Synth stab for melody lines."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    if wave == "saw":
        signal = 2 * (t * freq % 1) - 1
    elif wave == "square":
        signal = np.sign(np.sin(2 * np.pi * freq * t))
    else:
        signal = np.sin(2 * np.pi * freq * t)
    signal = _apply_envelope(signal, attack=0.005, decay=0.05, sustain=0.6, release=0.1)
    return _normalize(signal)


# --- FX ---

def synth_riser(duration: float = 2.0) -> np.ndarray:
    """Noise riser / sweep FX."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    noise = np.random.randn(n)
    # Rising amplitude
    env = t / duration
    # Rising filter (simple HP simulation)
    freq = np.linspace(200, 8000, n)
    sweep = np.sin(2 * np.pi * np.cumsum(freq) / SAMPLE_RATE)
    signal = noise * env * 0.5 + sweep * env * 0.5
    return _normalize(signal)


def synth_impact(duration: float = 0.5) -> np.ndarray:
    """Impact / downlifter FX."""
    n = int(duration * SAMPLE_RATE)
    t = np.linspace(0, duration, n, endpoint=False)
    freq = 200 * np.exp(-t * 3) + 30
    phase = 2 * np.pi * np.cumsum(freq) / SAMPLE_RATE
    signal = np.sin(phase) + np.random.randn(n) * 0.3
    env = np.exp(-t * 4)
    return _normalize(signal * env)


# --- Save all samples to disk ---

def generate_all_samples(base_dir: str | Path, overwrite: bool = False) -> dict[str, list[str]]:
    """Generate the full sample library and return paths by category."""
    base = Path(base_dir)
    generated: dict[str, list[str]] = {}

    categories = {
        "bass": [
            ("808_bass_01.wav", lambda: synth_808_bass(40, 0.8, 0.0)),
            ("808_bass_02.wav", lambda: synth_808_bass(35, 1.0, 0.3)),
            ("808_bass_03.wav", lambda: synth_808_bass(45, 0.6, 0.6)),
            ("808_bass_04.wav", lambda: synth_808_bass(50, 0.5, 0.1)),
        ],
        "drums": [
            ("kick_phonk_01.wav", lambda: synth_kick(0.3)),
            ("kick_phonk_02.wav", lambda: synth_kick(0.4)),
            ("snare_01.wav", lambda: synth_snare(0.2)),
            ("snare_02.wav", lambda: synth_snare(0.15)),
            ("hihat_closed_01.wav", lambda: synth_hihat(0.05)),
            ("hihat_closed_02.wav", lambda: synth_hihat(0.03)),
            ("hihat_open_01.wav", lambda: synth_hihat(0.05, open_hat=True)),
        ],
        "cowbell": [
            ("cowbell_01.wav", lambda: synth_cowbell(0.15)),
            ("cowbell_02.wav", lambda: synth_cowbell(0.1)),
        ],
        "vocals": [
            ("vocal_aggressive_01.wav", lambda: synth_vocal_chop("aggressive", 0.4)),
            ("vocal_aggressive_02.wav", lambda: synth_vocal_chop("aggressive", 0.25)),
            ("vocal_memphis_01.wav", lambda: synth_vocal_chop("memphis", 0.4)),
            ("vocal_memphis_02.wav", lambda: synth_vocal_chop("memphis", 0.3)),
            ("vocal_minimal_01.wav", lambda: synth_vocal_chop("minimal", 0.3)),
            ("vocal_dark_01.wav", lambda: synth_vocal_chop("dark", 0.5)),
            ("vocal_melodic_01.wav", lambda: synth_vocal_chop("melodic", 0.35)),
        ],
        "melody": [
            ("synth_lead_01.wav", lambda: synth_melody_stab(440, 0.3, "saw")),
            ("synth_lead_02.wav", lambda: synth_melody_stab(523, 0.25, "saw")),
            ("synth_square_01.wav", lambda: synth_melody_stab(392, 0.3, "square")),
            ("piano_stab_01.wav", lambda: synth_melody_stab(349, 0.35, "sine")),
            ("piano_stab_02.wav", lambda: synth_melody_stab(294, 0.4, "sine")),
        ],
        "fx": [
            ("riser_01.wav", lambda: synth_riser(2.0)),
            ("riser_02.wav", lambda: synth_riser(1.5)),
            ("impact_01.wav", lambda: synth_impact(0.5)),
            ("impact_02.wav", lambda: synth_impact(0.3)),
        ],
    }

    for category, samples in categories.items():
        cat_dir = base / category
        cat_dir.mkdir(parents=True, exist_ok=True)
        paths = []
        for filename, gen_fn in samples:
            filepath = cat_dir / filename
            if not overwrite and filepath.exists():
                paths.append(str(filepath))
                continue
            signal = gen_fn()
            data = _to_int16(signal)
            wavfile.write(str(filepath), SAMPLE_RATE, data)
            paths.append(str(filepath))
        generated[category] = paths

    return generated


if __name__ == "__main__":
    samples_dir = Path(__file__).parent.parent.parent / "samples"
    result = generate_all_samples(samples_dir)
    total = sum(len(v) for v in result.values())
    print(f"Generated {total} samples across {len(result)} categories:")
    for cat, paths in result.items():
        print(f"  {cat}: {len(paths)} samples")
