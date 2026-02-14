"""
PhonkArena Track Generator.

Generates short dark phonk battle loops with:
- slowed halftime groove (88-94 BPM)
- long 808 with occasional glide
- chopped pitched vocals
- event export for observability/debugging
"""

from __future__ import annotations

import json
import os
import random
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

from ..models.agent import AgentDNA, EffectType

SAMPLE_RATE = 44100
F_MINOR_PENTATONIC_HZ = (43.65, 51.91, 58.27, 65.41, 77.78)  # F, Ab, Bb, C, Eb

STYLE_PROFILES = {
    # Inspired by slowed/dark phonk references, not direct melody copies.
    "acido_slowed": {
        "root_hz": 43.65,  # F
        "intervals": [0, 3, 5, 7, 10],
        "melody_steps_beats": [0.0, 1.5, 3.0],
        "melody_transpose": [-3, -2, 0, 2],
        "bass_move_prob": 0.2,
        "cowbell_mul": 0.9,
        "vocal_mul": 0.9,
    },
    "memphis_classic": {
        "root_hz": 49.00,  # G
        "intervals": [0, 3, 5, 7, 10],
        "melody_steps_beats": [0.0, 2.0, 3.5],
        "melody_transpose": [-5, -3, -2, 0, 2],
        "bass_move_prob": 0.34,
        "cowbell_mul": 1.05,
        "vocal_mul": 1.2,
    },
    "drift_night": {
        "root_hz": 41.20,  # E
        "intervals": [0, 2, 3, 5, 7, 10],
        "melody_steps_beats": [0.0, 1.0, 2.5, 3.5],
        "melody_transpose": [-7, -5, -3, -2, 0],
        "bass_move_prob": 0.28,
        "cowbell_mul": 1.15,
        "vocal_mul": 0.85,
    },
    "cowbell_ritual": {
        "root_hz": 46.25,  # F#
        "intervals": [0, 3, 5, 6, 7, 10],
        "melody_steps_beats": [0.0, 1.5, 2.0, 3.0],
        "melody_transpose": [-5, -3, -2, 0, 3],
        "bass_move_prob": 0.24,
        "cowbell_mul": 1.35,
        "vocal_mul": 0.8,
    },
    "shadow_drive": {
        "root_hz": 38.89,  # D#
        "intervals": [0, 1, 3, 5, 7, 8, 10],
        "melody_steps_beats": [0.0, 2.0, 3.0],
        "melody_transpose": [-7, -5, -3, -2, 0, 2],
        "bass_move_prob": 0.16,
        "cowbell_mul": 0.75,
        "vocal_mul": 1.0,
    },
}
DEFAULT_STYLE_PROFILE = "acido_slowed"


class TrackGenerator:
    """Generates phonk tracks from agent DNA parameters."""

    def __init__(self, samples_dir: str | Path):
        self.samples_dir = Path(samples_dir)
        self._sample_cache: dict[str, np.ndarray] = {}
        self.sample_roots = self._discover_sample_roots(self.samples_dir)
        self.available_packs = sorted(self.sample_roots.keys())

    def _discover_sample_roots(self, base_dir: Path) -> dict[str, Path]:
        """
        Discover sample packs.
        - core: backend/samples
        - optional packs: backend/samples_packs/<pack_name>/
        - optional extra dirs via PHONK_PACK_DIRS (pathsep-separated)
        """
        roots: dict[str, Path] = {"core": base_dir}

        packs_dir = base_dir.parent / "samples_packs"
        if packs_dir.exists():
            for pack in packs_dir.iterdir():
                if pack.is_dir():
                    roots[pack.name.lower()] = pack

        extra_dirs = os.getenv("PHONK_PACK_DIRS", "").strip()
        if extra_dirs:
            for raw in extra_dirs.split(os.pathsep):
                candidate = Path(raw.strip()).expanduser()
                if candidate.exists() and candidate.is_dir():
                    roots[candidate.name.lower()] = candidate

        return roots

    @staticmethod
    def _clamp(value: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, value))

    @staticmethod
    def _rms(signal: np.ndarray) -> float:
        if len(signal) == 0:
            return 0.0
        return float(np.sqrt(np.mean(signal * signal)))

    def _fit_rms(self, signal: np.ndarray, target_rms: float) -> np.ndarray:
        current = self._rms(signal)
        if current < 1e-9:
            return signal
        return signal * (target_rms / current)

    def _rebalance_low_end(self, signal: np.ndarray, target_ratio: float = 0.46) -> np.ndarray:
        """
        Keep low-end proportion under control so the 808 does not mask everything.
        ratio ~= RMS(low<120Hz) / (RMS(low<120Hz) + RMS(rest))
        """
        low = self._lowpass(signal, 120.0)
        high = signal - low
        low_rms = self._rms(low)
        high_rms = self._rms(high)
        denom = low_rms + high_rms + 1e-9
        ratio = low_rms / denom
        if ratio <= target_ratio:
            return signal
        scale = target_ratio / max(ratio, 1e-9)
        return low * scale + high

    def _load_sample(self, path: str | Path) -> np.ndarray:
        """Load a WAV file as a float64 array normalized to [-1, 1]."""
        path = str(path)
        if path in self._sample_cache:
            return self._sample_cache[path].copy()
        sr, data = wavfile.read(path)
        if data.dtype == np.int16:
            data = data.astype(np.float64) / 32767.0
        elif data.dtype == np.int32:
            data = data.astype(np.float64) / 2147483647.0
        elif data.dtype == np.float32:
            data = data.astype(np.float64)
        # Mono only
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        self._sample_cache[path] = data
        return data.copy()

    def _parse_pack_selector(self, selector: str) -> list[str]:
        if not selector:
            return ["core"]
        normalized = selector.lower()
        for sep in ("|", "+", ";", "/"):
            normalized = normalized.replace(sep, ",")
        tokens = [t.strip() for t in normalized.split(",") if t.strip()]
        if not tokens:
            return ["core"]
        return tokens

    def _source_matches_selector(self, source_name: str, selector_tokens: list[str]) -> bool:
        if not selector_tokens:
            return True
        if "any" in selector_tokens or "all" in selector_tokens:
            return True
        for token in selector_tokens:
            if token == source_name or token in source_name:
                return True
        return False

    def _selector_has_available_pack(self, selector: str) -> bool:
        tokens = self._parse_pack_selector(selector)
        if "any" in tokens or "all" in tokens:
            return True
        return any(self._source_matches_selector(name, tokens) for name in self.sample_roots.keys())

    def _resolve_profile(self, dna: AgentDNA) -> dict:
        profile_name = (dna.melody_profile or DEFAULT_STYLE_PROFILE).lower()
        profile = STYLE_PROFILES.get(profile_name)
        if profile is None:
            profile = STYLE_PROFILES[DEFAULT_STYLE_PROFILE]
        return profile

    def _scale_frequencies(self, root_hz: float, intervals: list[int]) -> list[float]:
        return [float(root_hz * (2 ** (semi / 12.0))) for semi in intervals]

    def _list_samples(self, category: str, pack_selector: str = "core") -> list[Path]:
        selector_tokens = self._parse_pack_selector(pack_selector)
        collected: list[Path] = []

        for source_name, root in self.sample_roots.items():
            if not self._source_matches_selector(source_name, selector_tokens):
                continue
            cat_dir = root / category
            if cat_dir.exists():
                collected.extend(
                    sorted(p for p in cat_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".wav")
                )

        # Fallback to core/all sources if selected pack has no files in category.
        if not collected:
            for root in self.sample_roots.values():
                cat_dir = root / category
                if cat_dir.exists():
                    collected.extend(
                        sorted(p for p in cat_dir.rglob("*") if p.is_file() and p.suffix.lower() == ".wav")
                    )

        return collected

    def _pick_sample(
        self,
        category: str,
        variation: float,
        keyword: str = "",
        pack_selector: str = "core",
    ) -> np.ndarray | None:
        """Pick a sample from a category, with variation controlling randomness."""
        samples = self._list_samples(category, pack_selector=pack_selector)
        if keyword:
            filtered = [s for s in samples if keyword.lower() in s.name.lower()]
            if filtered:
                samples = filtered
        if not samples:
            return None
        if variation < 0.3:
            return self._load_sample(samples[0])
        return self._load_sample(random.choice(samples))

    def _overlay(self, base: np.ndarray, layer: np.ndarray, position: int, gain: float = 1.0) -> np.ndarray:
        """Overlay a sample onto the base track at a given sample position."""
        end = min(position + len(layer), len(base))
        length = end - position
        if length > 0:
            base[position:end] += layer[:length] * gain
        return base

    def _event(
        self,
        events: list[dict] | None,
        position: int,
        instrument: str,
        velocity: float,
        note: str | float | None = None,
        duration_samples: int | None = None,
        extra: dict | None = None,
    ) -> None:
        if events is None:
            return
        payload: dict[str, object] = {
            "time": round(position / SAMPLE_RATE, 4),
            "instrument": instrument,
            "velocity": round(float(self._clamp(velocity, 0.0, 1.0)), 3),
        }
        if note is not None:
            payload["note"] = note
        if duration_samples is not None:
            payload["duration"] = round(duration_samples / SAMPLE_RATE, 4)
        if extra:
            payload.update(extra)
        events.append(payload)

    def _beats_to_samples(self, beats: float, tempo: int) -> int:
        """Convert beat count to sample count."""
        seconds_per_beat = 60.0 / tempo
        return int(beats * seconds_per_beat * SAMPLE_RATE)

    def _effective_tempo(self, dna: AgentDNA) -> int:
        """Map DNA tempo to slowed groove range 88-94 BPM."""
        tempo = int(dna.tempo)
        if tempo >= 120:
            tempo = int(round(tempo * 0.64))
        return int(self._clamp(tempo, 88, 94))

    def _normalize_peak(self, signal: np.ndarray, target: float = 0.95) -> np.ndarray:
        peak = np.max(np.abs(signal))
        if peak <= 0:
            return signal
        return signal / peak * target

    def _soft_clip(self, signal: np.ndarray, drive: float) -> np.ndarray:
        drive = self._clamp(drive, 0.0, 1.0)
        return np.tanh(signal * (1.0 + drive * 4.0))

    def _limit(self, signal: np.ndarray, threshold: float = 0.92) -> np.ndarray:
        threshold = self._clamp(threshold, 0.5, 0.99)
        return np.clip(signal, -threshold, threshold)

    def _lowpass(self, signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
        cutoff = self._clamp(cutoff_hz, 30.0, SAMPLE_RATE * 0.45)
        rc = 1.0 / (2.0 * np.pi * cutoff)
        dt = 1.0 / SAMPLE_RATE
        alpha = dt / (rc + dt)
        b = [alpha]
        a = [1.0, -(1.0 - alpha)]
        return lfilter(b, a, signal)

    def _highpass(self, signal: np.ndarray, cutoff_hz: float) -> np.ndarray:
        cutoff = self._clamp(cutoff_hz, 20.0, SAMPLE_RATE * 0.45)
        rc = 1.0 / (2.0 * np.pi * cutoff)
        dt = 1.0 / SAMPLE_RATE
        alpha = rc / (rc + dt)
        out = np.zeros_like(signal)
        prev_x = 0.0
        prev_y = 0.0
        for i, x in enumerate(signal):
            y = alpha * (prev_y + x - prev_x)
            out[i] = y
            prev_x = x
            prev_y = y
        return out

    def _pitch_shift_resample(self, signal: np.ndarray, semitones: int) -> np.ndarray:
        if len(signal) < 4 or semitones == 0:
            return signal.copy()
        ratio = 2 ** (semitones / 12.0)
        if ratio <= 0:
            return signal.copy()
        new_len = max(32, int(len(signal) / ratio))
        src_x = np.arange(len(signal))
        dst_x = np.linspace(0, len(signal) - 1, new_len)
        return np.interp(dst_x, src_x, signal).astype(np.float64)

    def _fade(self, signal: np.ndarray, in_ms: float = 4.0, out_ms: float = 16.0) -> np.ndarray:
        out = signal.copy()
        n = len(out)
        if n < 4:
            return out
        fade_in = min(int(in_ms * SAMPLE_RATE / 1000), n // 2)
        fade_out = min(int(out_ms * SAMPLE_RATE / 1000), n // 2)
        if fade_in > 0:
            out[:fade_in] *= np.linspace(0, 1, fade_in)
        if fade_out > 0:
            out[-fade_out:] *= np.linspace(1, 0, fade_out)
        return out

    def _simple_reverb(self, signal: np.ndarray, decay: float = 0.3, delay_ms: float = 45) -> np.ndarray:
        delay_samples = int(delay_ms * SAMPLE_RATE / 1000)
        out = signal.copy()
        for i in range(1, 4):
            offset = delay_samples * i
            gain = decay ** i
            if offset < len(signal):
                out[offset:] += signal[:len(signal) - offset] * gain
        return out

    def _simple_delay(self, signal: np.ndarray, delay_ms: float = 300, feedback: float = 0.3) -> np.ndarray:
        delay_samples = int(delay_ms * SAMPLE_RATE / 1000)
        out = signal.copy()
        for i in range(1, 4):
            offset = delay_samples * i
            gain = feedback ** i
            if offset < len(signal):
                out[offset:] += signal[:len(signal) - offset] * gain
        return out

    def _simple_chorus(self, signal: np.ndarray) -> np.ndarray:
        n = len(signal)
        if n < 2:
            return signal
        t = np.arange(n) / SAMPLE_RATE
        lfo = np.sin(2 * np.pi * 1.5 * t) * 0.002 * SAMPLE_RATE
        delay = (lfo + 0.01 * SAMPLE_RATE).astype(int)
        delay = np.clip(delay, 1, max(1, n - 1))
        indices = np.clip(np.arange(n) - delay, 0, n - 1)
        wet = signal[indices]
        return signal * 0.7 + wet * 0.3

    def _add_vinyl_crackle(self, signal: np.ndarray) -> np.ndarray:
        n = len(signal)
        if n < 2:
            return signal
        crackle = np.zeros(n)
        num_pops = max(1, int(n * 0.00008))
        pop_positions = np.random.randint(0, n, num_pops)
        crackle[pop_positions] = np.random.randn(num_pops) * 0.045
        hiss = np.random.randn(n) * 0.006
        return signal + crackle + hiss

    def _pitch_warble(self, signal: np.ndarray) -> np.ndarray:
        n = len(signal)
        if n < 2:
            return signal
        t = np.arange(n) / SAMPLE_RATE
        mod = np.sin(2 * np.pi * 0.5 * t) * 0.003
        indices = np.arange(n) + (mod * SAMPLE_RATE).astype(int)
        indices = np.clip(indices.astype(int), 0, n - 1)
        return signal[indices]

    def _dark_tone_shape(self, signal: np.ndarray, darkness: float) -> np.ndarray:
        """Dark tilt without fully killing highs."""
        darkness = self._clamp(darkness, 0.0, 1.0)
        cutoff = 12000.0 - darkness * 3800.0
        body = self._lowpass(signal, cutoff)
        sub = self._lowpass(signal, 130.0)
        presence = self._highpass(signal, 1800.0)
        return body * 0.86 + signal * 0.2 + sub * (0.02 + darkness * 0.045) + presence * 0.06

    # --- Pattern generators ---

    def _create_drum_pattern(
        self,
        dna: AgentDNA,
        duration_samples: int,
        tempo: int,
        events: list[dict] | None = None,
    ) -> np.ndarray:
        """Halftime groove: kick heavy, snare on beat 3, hats on 1/16."""
        track = np.zeros(duration_samples)
        beat_samples = self._beats_to_samples(1, tempo)
        sixteenth = max(1, beat_samples // 4)
        thirty_second = max(1, sixteenth // 2)
        bar_samples = beat_samples * 4

        kick = self._pick_sample("drums", dna.sample_variation, "kick", pack_selector=dna.sample_pack)
        snare = self._pick_sample("drums", dna.sample_variation, "snare", pack_selector=dna.sample_pack)
        hihat_c = self._pick_sample("drums", dna.sample_variation, "hihat_closed", pack_selector=dna.sample_pack)
        hihat_o = self._pick_sample("drums", dna.sample_variation, "hihat_open", pack_selector=dna.sample_pack)

        bar_start = 0
        while bar_start < duration_samples:
            if kick is not None:
                kick_positions = [bar_start]  # beat 1 always
                if random.random() < 0.45:
                    kick_positions.append(bar_start + beat_samples + sixteenth * 2)
                if random.random() < 0.32:
                    kick_positions.append(bar_start + beat_samples * 2 - sixteenth)
                if random.random() < 0.28:
                    kick_positions.append(bar_start + beat_samples * 3 + sixteenth)
                for kp in kick_positions:
                    if 0 <= kp < duration_samples:
                        vel = random.uniform(0.72, 0.96)
                        self._overlay(track, kick, kp, gain=vel)
                        self._event(events, kp, "kick", vel, note="C1")

            if snare is not None:
                snare_pos = bar_start + beat_samples * 2  # beat 3
                if snare_pos < duration_samples:
                    vel = random.uniform(0.82, 0.98)
                    self._overlay(track, snare, snare_pos, gain=vel)
                    self._event(events, snare_pos, "snare", vel, note="D2")
                if random.random() < 0.35:
                    ghost_offset = random.choice([-sixteenth, sixteenth])
                    ghost_pos = snare_pos + ghost_offset
                    if 0 <= ghost_pos < duration_samples:
                        vel = random.uniform(0.35, 0.52)
                        self._overlay(track, snare, ghost_pos, gain=vel)
                        self._event(events, ghost_pos, "snare_ghost", vel, note="D2")

            if hihat_c is not None:
                hat_play_prob = self._clamp(dna.hi_hat_density * 0.85 + 0.12, 0.45, 0.98)
                for step in range(16):
                    hat_pos = bar_start + step * sixteenth
                    if hat_pos >= duration_samples:
                        break
                    if random.random() > hat_play_prob:
                        continue
                    vel = random.uniform(0.55, 0.85)
                    gain = vel * 0.33
                    self._overlay(track, hihat_c, hat_pos, gain=gain)
                    self._event(events, hat_pos, "hihat_closed", vel, note="F#2")

                    # occasional 1/32 doubles
                    if random.random() < 0.12:
                        dbl_pos = hat_pos + thirty_second
                        if dbl_pos < duration_samples:
                            dbl_vel = vel * random.uniform(0.65, 0.82)
                            self._overlay(track, hihat_c, dbl_pos, gain=dbl_vel * 0.33)
                            self._event(events, dbl_pos, "hihat_double", dbl_vel, note="F#2")

                    # occasional open hats
                    if hihat_o is not None and step in (7, 15) and random.random() < 0.24:
                        open_vel = random.uniform(0.58, 0.8)
                        self._overlay(track, hihat_o, hat_pos, gain=open_vel * 0.24)
                        self._event(events, hat_pos, "hihat_open", open_vel, note="A#2")

            bar_start += bar_samples

        # Drum bus saturation + clipper
        track = self._soft_clip(track, 0.12 + dna.distortion_drive * 0.4)
        return self._limit(track, 0.96)

    def _synth_808_note(
        self,
        freq: float,
        duration: float,
        distortion: float,
        release: float,
        glide_to: float | None = None,
        glide_ms: float = 100.0,
    ) -> np.ndarray:
        n = max(1, int(duration * SAMPLE_RATE))
        freq_curve = np.full(n, max(25.0, freq))
        if glide_to is not None:
            glide_len = max(64, int(glide_ms * SAMPLE_RATE / 1000))
            glide_start = max(0, n - glide_len)
            freq_curve[glide_start:] = np.linspace(freq_curve[glide_start], max(25.0, glide_to), n - glide_start)

        phase = 2 * np.pi * np.cumsum(freq_curve) / SAMPLE_RATE
        signal = np.sin(phase) + 0.26 * np.sin(phase * 2) + 0.1 * np.sin(phase * 3)

        env = np.ones(n)
        attack_len = max(1, int(0.01 * SAMPLE_RATE))
        env[:attack_len] = np.linspace(0, 1, attack_len)
        release_len = min(n, max(1, int(release * SAMPLE_RATE)))
        env[-release_len:] *= np.linspace(1, 0, release_len)

        # 808 bus waveshaper + clipper
        return self._limit(self._soft_clip(signal * env, distortion), 0.97)

    def _create_bass_line(
        self,
        dna: AgentDNA,
        duration_samples: int,
        tempo: int,
        events: list[dict] | None = None,
    ) -> np.ndarray:
        """Long sustain 808 with profile-specific tonal center and occasional glide."""
        track = np.zeros(duration_samples)
        beat_samples = self._beats_to_samples(1, tempo)
        bar_samples = beat_samples * 4
        total_bars = max(1, int(np.ceil(duration_samples / bar_samples)))

        profile = self._resolve_profile(dna)
        root_hz = float(profile.get("root_hz", F_MINOR_PENTATONIC_HZ[0]))
        intervals = [int(x) for x in profile.get("intervals", [0, 3, 5, 7, 10])]
        scale_hz = self._scale_frequencies(root_hz, intervals)
        move_prob = self._clamp(
            float(profile.get("bass_move_prob", 0.22)) + (1.0 - dna.bass_intensity) * 0.08,
            0.08,
            0.48,
        )

        notes = [root_hz]
        for _ in range(total_bars):
            if random.random() < (1.0 - move_prob):
                notes.append(notes[-1])
            else:
                candidates = [root_hz] + scale_hz
                weights = [3.2] + [1.0] * len(scale_hz)
                notes.append(float(random.choices(candidates, weights=weights, k=1)[0]))

        attack_sample = self._pick_sample("bass", dna.sample_variation, pack_selector=dna.sample_pack)

        for bar_idx in range(total_bars):
            pos = bar_idx * bar_samples
            if pos >= duration_samples:
                break
            current_freq = notes[bar_idx]
            next_freq = notes[bar_idx + 1] if (bar_idx + 1) < len(notes) else current_freq
            do_glide = random.random() < self._clamp(dna.glide_probability, 0.1, 0.6)
            glide_to = next_freq if do_glide else None
            glide_ms = random.uniform(80.0, 140.0)
            note = self._synth_808_note(
                freq=current_freq,
                duration=(bar_samples + int(beat_samples * 0.8)) / SAMPLE_RATE,
                distortion=0.16 + dna.distortion_drive * 0.3,
                release=0.28 + dna.bass_intensity * 0.35,
                glide_to=glide_to,
                glide_ms=glide_ms,
            )
            gain = 0.2 + dna.bass_intensity * 0.22
            self._overlay(track, note, pos, gain=gain)
            if attack_sample is not None:
                self._overlay(track, attack_sample, pos, gain=0.02 + dna.bass_intensity * 0.035)
            self._event(
                events,
                pos,
                "808",
                velocity=self._clamp(gain, 0.0, 1.0),
                note=round(current_freq, 2),
                duration_samples=len(note),
                extra={
                    "glide": do_glide,
                    "glide_to": round(glide_to, 2) if glide_to is not None else None,
                    "glide_ms": round(glide_ms, 1) if glide_to is not None else None,
                    "profile": dna.melody_profile,
                },
            )

        # Keep low-end tight, avoid full-track masking.
        track = self._highpass(track, 24.0)
        track = self._lowpass(track, 210.0)
        return self._limit(track, 0.98)

    def _create_cowbell_hits(
        self,
        dna: AgentDNA,
        duration_samples: int,
        tempo: int,
        events: list[dict] | None = None,
    ) -> np.ndarray:
        track = np.zeros(duration_samples)
        profile = self._resolve_profile(dna)
        cowbell_mul = float(profile.get("cowbell_mul", 1.0))
        cowbell = self._pick_sample("cowbell", dna.sample_variation, pack_selector=dna.sample_pack)
        if cowbell is None:
            return track

        beat_samples = self._beats_to_samples(1, tempo)
        sixteenth = max(1, beat_samples // 4)

        pos = 0
        while pos < duration_samples:
            if random.random() < dna.cowbell_frequency * 0.22 * cowbell_mul:
                vel = random.uniform(0.35, 0.7)
                self._overlay(track, cowbell, pos, gain=vel * 0.35)
                self._event(events, pos, "cowbell", vel, note="F5")
            pos += sixteenth

        return self._highpass(track, 600.0)

    def _create_vocal_chops(
        self,
        dna: AgentDNA,
        duration_samples: int,
        tempo: int,
        events: list[dict] | None = None,
    ) -> np.ndarray:
        """Optional chopped vocal texture aligned to 1/8 or 1/16 grid."""
        track = np.zeros(duration_samples)
        profile = self._resolve_profile(dna)
        vocal_mul = float(profile.get("vocal_mul", 1.0))
        style_keyword = dna.vocal_chop_style.value
        vocal = self._pick_sample("vocals", dna.sample_variation, style_keyword, pack_selector=dna.sample_pack)
        if vocal is None:
            vocal = self._pick_sample("vocals", dna.sample_variation, pack_selector=dna.sample_pack)
        if vocal is None:
            return track

        beat_samples = self._beats_to_samples(1, tempo)
        sixteenth = max(1, beat_samples // 4)
        eighth = sixteenth * 2
        bar_samples = beat_samples * 4

        bar_start = 0
        while bar_start < duration_samples:
            if random.random() < self._clamp(0.25 / max(vocal_mul, 0.65), 0.1, 0.45):
                bar_start += bar_samples
                continue

            grid = sixteenth if random.random() < 0.55 else eighth
            steps = max(1, bar_samples // grid)
            max_chops = 1 + int(dna.melody_complexity * 2.2)
            num_chops = random.randint(1, max(1, max_chops))
            chosen_steps = sorted(random.sample(range(steps), k=min(num_chops, steps)))

            for step in chosen_steps:
                chop_pos = bar_start + step * grid
                if chop_pos >= duration_samples:
                    continue
                min_len = int(0.09 * SAMPLE_RATE)
                max_len = int(0.22 * SAMPLE_RATE)
                chop_len = random.randint(min_len, max_len)
                if len(vocal) <= chop_len + 8:
                    chop = vocal.copy()
                else:
                    start = random.randint(0, len(vocal) - chop_len - 1)
                    chop = vocal[start:start + chop_len]

                semitones = int(self._clamp(dna.vocal_pitch_down + random.choice([-1, 0, 0, 1]), -6, -3))
                chop = self._pitch_shift_resample(chop, semitones)
                chop = self._fade(chop, in_ms=3.0, out_ms=20.0)
                chop = self._highpass(chop, 170.0)
                chop = self._lowpass(chop, 5200.0)

                # Mostly dry, occasional short room.
                if random.random() < 0.22:
                    chop = self._simple_reverb(chop, decay=0.2, delay_ms=32)

                vel = random.uniform(0.45, 0.78)
                self._overlay(track, chop, chop_pos, gain=vel * 0.36 * vocal_mul)
                self._event(events, chop_pos, "vocal_chop", vel, note=f"pitch_{semitones}")

            bar_start += bar_samples

        track = self._soft_clip(track, 0.08 + dna.distortion_drive * 0.22)
        return self._limit(track, 0.97)

    def _create_melody(
        self,
        dna: AgentDNA,
        duration_samples: int,
        tempo: int,
        events: list[dict] | None = None,
    ) -> np.ndarray:
        track = np.zeros(duration_samples)
        if dna.melody_complexity < 0.18:
            return track

        melody_samples = self._list_samples("melody", pack_selector=dna.sample_pack)
        if not melody_samples:
            return track

        profile = self._resolve_profile(dna)
        root_hz = float(profile.get("root_hz", F_MINOR_PENTATONIC_HZ[0]))
        intervals = [int(x) for x in profile.get("intervals", [0, 3, 5, 7, 10])]
        profile_steps = [float(x) for x in profile.get("melody_steps_beats", [0.0, 2.0])]
        transpose_choices = [int(x) for x in profile.get("melody_transpose", [-3, -2, 0, 2])]
        note_weights = [0.45] + [0.2] + [0.12] * max(0, len(intervals) - 2)
        note_weights = note_weights[:len(intervals)]
        if len(note_weights) < len(intervals):
            note_weights.extend([0.1] * (len(intervals) - len(note_weights)))

        beat_samples = self._beats_to_samples(1, tempo)
        bar_samples = beat_samples * 4
        bar_start = 0

        while bar_start < duration_samples:
            for beat_pos in profile_steps:
                pos = bar_start + self._beats_to_samples(beat_pos, tempo)
                if pos >= duration_samples:
                    continue
                play_prob = self._clamp(0.18 + dna.melody_complexity * 0.62, 0.18, 0.86)
                if random.random() > play_prob:
                    continue
                sample = self._load_sample(
                    random.choice(melody_samples) if dna.sample_variation > 0.3 else melody_samples[0]
                )
                interval = int(random.choices(intervals, weights=note_weights, k=1)[0])
                semi = interval + random.choice(transpose_choices)
                sample = self._pitch_shift_resample(sample, semi)
                sample = self._highpass(sample, 140.0)
                sample = self._lowpass(sample, 7000.0)
                vel = random.uniform(0.42, 0.72)
                self._overlay(track, sample, pos, gain=vel * 0.34)
                target_hz = root_hz * (2 ** (interval / 12.0))
                self._event(
                    events,
                    pos,
                    "melody",
                    vel,
                    note=round(target_hz, 2),
                    extra={"profile": dna.melody_profile},
                )
            bar_start += bar_samples

        return self._limit(track, 0.97)

    # --- Effects ---

    def _apply_effects(self, signal: np.ndarray, effects: list[EffectType]) -> np.ndarray:
        for effect in effects:
            if effect == EffectType.DISTORTION_HEAVY:
                signal = self._soft_clip(signal, 0.65)
            elif effect == EffectType.DISTORTION_LIGHT:
                signal = self._soft_clip(signal, 0.28)
            elif effect == EffectType.REVERB_HALL:
                signal = self._simple_reverb(signal, decay=0.5, delay_ms=65)
            elif effect == EffectType.REVERB_LIGHT:
                signal = self._simple_reverb(signal, decay=0.25, delay_ms=36)
            elif effect == EffectType.VINYL_CRACKLE:
                signal = self._add_vinyl_crackle(signal)
            elif effect == EffectType.PITCH_SHIFT:
                signal = self._pitch_warble(signal)
            elif effect == EffectType.DELAY:
                signal = self._simple_delay(signal, delay_ms=270, feedback=0.28)
            elif effect == EffectType.CHORUS:
                signal = self._simple_chorus(signal)
        return signal

    # --- Mastering ---

    def _apply_sidechain(self, signal: np.ndarray, dna: AgentDNA, tempo: int) -> np.ndarray:
        has_sidechain = any(e in (EffectType.SIDECHAIN_HARD, EffectType.SIDECHAIN_LIGHT) for e in dna.effects)
        if not has_sidechain:
            return signal

        hard = EffectType.SIDECHAIN_HARD in dna.effects
        depth = 0.55 if hard else 0.32
        beat_samples = self._beats_to_samples(1, tempo)

        env = np.ones(len(signal))
        pos = 0
        while pos < len(signal):
            duck_len = min(max(1, beat_samples // 3), len(signal) - pos)
            env[pos:pos + duck_len] = np.linspace(1.0 - depth, 1.0, duck_len)
            pos += beat_samples
        return signal * env

    def _master(self, signal: np.ndarray, drive: float) -> np.ndarray:
        """Master chain: soft clip + limiter."""
        signal = signal - np.mean(signal)
        signal = self._fit_rms(signal, 0.19)
        signal = self._soft_clip(signal, 0.1 + drive * 0.35)
        signal = self._limit(signal, 0.92)
        return self._normalize_peak(signal, 0.92)

    def _build_dsp_profile(self, dna: AgentDNA, tempo: int) -> dict:
        profile = self._resolve_profile(dna)
        return {
            "tempo_bpm": tempo,
            "sample_pack": dna.sample_pack,
            "melody_profile": dna.melody_profile,
            "style_root_hz": round(float(profile.get("root_hz", F_MINOR_PENTATONIC_HZ[0])), 2),
            "drum_bus": {
                "saturation_drive": round(0.12 + dna.distortion_drive * 0.4, 3),
                "clip_threshold": 0.96,
            },
            "bass_bus": {
                "waveshaper_drive": round(0.16 + dna.distortion_drive * 0.3, 3),
                "clip_threshold": 0.97,
                "glide_probability": round(self._clamp(dna.glide_probability, 0.1, 0.6), 3),
                "glide_ms_range": [80, 140],
            },
            "vocal_bus": {
                "pitch_range_semitones": [-6, -3],
                "room_reverb_chance": 0.22,
            },
            "master": {
                "soft_clip_drive": round(0.1 + dna.distortion_drive * 0.35, 3),
                "limiter_threshold": 0.92,
            },
        }

    def _generate(
        self,
        dna: AgentDNA,
        duration: float = 10.0,
        seed: int | None = None,
        collect_events: bool = False,
    ) -> tuple[np.ndarray, list[dict], dict]:
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        n_samples = int(duration * SAMPLE_RATE)
        tempo = self._effective_tempo(dna)
        events: list[dict] = [] if collect_events else []

        drums = self._create_drum_pattern(dna, n_samples, tempo, events if collect_events else None)
        bass = self._create_bass_line(dna, n_samples, tempo, events if collect_events else None)
        cowbell = self._create_cowbell_hits(dna, n_samples, tempo, events if collect_events else None)
        vocals = self._create_vocal_chops(dna, n_samples, tempo, events if collect_events else None)
        melody = self._create_melody(dna, n_samples, tempo, events if collect_events else None)

        # Stem balance: stop 808 from masking everything else.
        drums = self._fit_rms(self._highpass(drums, 35.0), 0.2)
        bass = self._fit_rms(self._lowpass(self._highpass(bass, 26.0), 190.0), 0.08)
        cowbell = self._fit_rms(self._highpass(cowbell, 650.0), 0.03)
        vocals = self._fit_rms(self._highpass(vocals, 170.0), 0.065)
        melody = self._fit_rms(self._highpass(melody, 140.0), 0.085)

        mix = drums + bass * 0.68 + cowbell + vocals + melody * 1.25
        mix = self._dark_tone_shape(mix, dna.darkness)
        mix = self._rebalance_low_end(mix, target_ratio=0.46)
        mix = self._apply_effects(mix, dna.effects)
        mix = self._apply_sidechain(mix, dna, tempo)
        mix = self._highpass(mix, 24.0)
        mix = self._master(mix, dna.distortion_drive)

        meta = {
            "duration_seconds": round(duration, 3),
            "tempo_bpm": tempo,
            "bars_estimate": round(duration / (60.0 / tempo * 4), 2),
            "sample_pack": dna.sample_pack,
            "sample_pack_found": self._selector_has_available_pack(dna.sample_pack),
            "melody_profile": dna.melody_profile,
            "available_packs": self.available_packs,
            "dsp": self._build_dsp_profile(dna, tempo),
        }

        if collect_events:
            events.sort(key=lambda e: float(e["time"]))

        return mix, events if collect_events else [], meta

    # --- Public API ---

    def get_available_packs(self) -> list[str]:
        return list(self.available_packs)

    def has_sample_pack(self, selector: str) -> bool:
        return self._selector_has_available_pack(selector)

    def generate_track(self, dna: AgentDNA, duration: float = 10.0, seed: int | None = None) -> np.ndarray:
        track, _, _ = self._generate(dna, duration=duration, seed=seed, collect_events=False)
        return track

    def generate_track_with_events(
        self,
        dna: AgentDNA,
        duration: float = 10.0,
        seed: int | None = None,
    ) -> tuple[np.ndarray, dict]:
        track, events, meta = self._generate(dna, duration=duration, seed=seed, collect_events=True)
        payload = {
            "meta": meta,
            "events": events,
        }
        return track, payload

    def generate_and_save(
        self,
        dna: AgentDNA,
        output_path: str | Path,
        duration: float = 10.0,
        seed: int | None = None,
        events_path: str | Path | None = None,
    ) -> str:
        """Generate a track, save WAV, and optionally save JSON events."""
        if events_path is None:
            track = self.generate_track(dna, duration=duration, seed=seed)
            payload = None
        else:
            track, payload = self.generate_track_with_events(dna, duration=duration, seed=seed)

        data = (np.clip(track, -1, 1) * 32767).astype(np.int16)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        wavfile.write(str(output_path), SAMPLE_RATE, data)

        if payload is not None and events_path is not None:
            events_path = Path(events_path)
            events_path.parent.mkdir(parents=True, exist_ok=True)
            with open(events_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)

        return str(output_path)
