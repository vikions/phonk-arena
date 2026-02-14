"""Agent DNA and Agent models for PhonkArena."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class VocalChopStyle(str, Enum):
    AGGRESSIVE = "aggressive"
    MEMPHIS = "memphis"
    MINIMAL = "minimal"
    DARK = "dark"
    MELODIC = "melodic"


class EffectType(str, Enum):
    DISTORTION_HEAVY = "distortion_heavy"
    DISTORTION_LIGHT = "distortion_light"
    SIDECHAIN_HARD = "sidechain_hard"
    SIDECHAIN_LIGHT = "sidechain_light"
    REVERB_HALL = "reverb_hall"
    REVERB_LIGHT = "reverb_light"
    VINYL_CRACKLE = "vinyl_crackle"
    PITCH_SHIFT = "pitch_shift"
    CHORUS = "chorus"
    DELAY = "delay"


ALL_EFFECTS = list(EffectType)
MELODY_PROFILES = [
    "acido_slowed",
    "memphis_classic",
    "drift_night",
    "cowbell_ritual",
    "shadow_drive",
]


@dataclass
class AgentDNA:
    """The mutable parameter set that defines an agent's music style."""

    bass_intensity: float = 0.5        # 0.0 - 1.0
    cowbell_frequency: float = 0.5     # 0.0 - 1.0
    vocal_chop_style: VocalChopStyle = VocalChopStyle.MEMPHIS
    tempo: int = 140                   # BPM (88 - 160)
    melody_complexity: float = 0.5     # 0.0 - 1.0
    effects: list[EffectType] = field(default_factory=lambda: [EffectType.REVERB_LIGHT])
    hi_hat_density: float = 0.5        # 0.0 - 1.0
    swing: float = 0.0                 # 0.0 - 1.0, shuffle/swing amount
    sample_variation: float = 0.5      # 0.0 - 1.0, how much sample selection varies
    sample_pack: str = "core"          # source pool: core / any / custom pack name
    melody_profile: str = "acido_slowed"  # stylistic melody blueprint
    glide_probability: float = 0.3     # 0.0 - 1.0, chance of 808 glide into next note
    darkness: float = 0.7              # 0.0 - 1.0, tonal darkness (high cut + low focus)
    distortion_drive: float = 0.6      # 0.0 - 1.0, saturation/clip drive
    vocal_pitch_down: int = -4         # -8 to -1 semitones

    def to_dict(self) -> dict:
        return {
            "bass_intensity": self.bass_intensity,
            "cowbell_frequency": self.cowbell_frequency,
            "vocal_chop_style": self.vocal_chop_style.value,
            "tempo": self.tempo,
            "melody_complexity": self.melody_complexity,
            "effects": [e.value for e in self.effects],
            "hi_hat_density": self.hi_hat_density,
            "swing": self.swing,
            "sample_variation": self.sample_variation,
            "sample_pack": self.sample_pack,
            "melody_profile": self.melody_profile,
            "glide_probability": self.glide_probability,
            "darkness": self.darkness,
            "distortion_drive": self.distortion_drive,
            "vocal_pitch_down": self.vocal_pitch_down,
        }

    @classmethod
    def from_dict(cls, data: dict) -> AgentDNA:
        return cls(
            bass_intensity=data["bass_intensity"],
            cowbell_frequency=data["cowbell_frequency"],
            vocal_chop_style=VocalChopStyle(data["vocal_chop_style"]),
            tempo=data["tempo"],
            melody_complexity=data["melody_complexity"],
            effects=[EffectType(e) for e in data["effects"]],
            hi_hat_density=data.get("hi_hat_density", 0.5),
            swing=data.get("swing", 0.0),
            sample_variation=data.get("sample_variation", 0.5),
            sample_pack=data.get("sample_pack", "core"),
            melody_profile=data.get("melody_profile", "acido_slowed"),
            glide_probability=data.get("glide_probability", 0.3),
            darkness=data.get("darkness", 0.7),
            distortion_drive=data.get("distortion_drive", 0.6),
            vocal_pitch_down=data.get("vocal_pitch_down", -4),
        )


@dataclass
class AgentStats:
    total_battles: int = 0
    wins: int = 0
    total_likes: int = 0

    @property
    def win_rate(self) -> float:
        return self.wins / self.total_battles if self.total_battles > 0 else 0.0

    @property
    def avg_likes_per_track(self) -> float:
        return self.total_likes / self.total_battles if self.total_battles > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "total_battles": self.total_battles,
            "wins": self.wins,
            "total_likes": self.total_likes,
            "win_rate": round(self.win_rate, 3),
            "avg_likes_per_track": round(self.avg_likes_per_track, 1),
        }


@dataclass
class Agent:
    """A competing agent in the PhonkArena."""

    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str = "Unnamed Agent"
    description: str = ""
    generation: int = 1
    dna: AgentDNA = field(default_factory=AgentDNA)
    stats: AgentStats = field(default_factory=AgentStats)
    dna_history: list[dict] = field(default_factory=list)

    def record_battle(self, likes: int, won: bool) -> None:
        self.stats.total_battles += 1
        self.stats.total_likes += likes
        if won:
            self.stats.wins += 1

    def evolve(self, new_dna: AgentDNA) -> None:
        self.dna_history.append(self.dna.to_dict())
        self.dna = new_dna
        self.generation += 1

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "generation": self.generation,
            "dna": self.dna.to_dict(),
            "stats": self.stats.to_dict(),
        }
