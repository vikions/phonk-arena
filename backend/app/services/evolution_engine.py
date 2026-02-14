"""
PhonkArena Evolution Engine.

Handles agent mutation/evolution based on battle performance (RLHF loop).
Losing agents mutate more aggressively, winners refine slightly.
"""

from __future__ import annotations

import random
from copy import deepcopy

from ..models.agent import (
    AgentDNA,
    Agent,
    EffectType,
    VocalChopStyle,
    ALL_EFFECTS,
    MELODY_PROFILES,
)


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


def _mutate_float(value: float, magnitude: float, lo: float = 0.0, hi: float = 1.0) -> float:
    """Mutate a float parameter by a random amount scaled by magnitude."""
    delta = random.gauss(0, magnitude)
    return _clamp(value + delta, lo, hi)


def _mutate_tempo(tempo: int, magnitude: float) -> int:
    """Mutate tempo within phonk range 88-160 BPM."""
    delta = int(random.gauss(0, magnitude * 15))
    return max(88, min(160, tempo + delta))


def _mutate_pitch_down(semitones: int, magnitude: float) -> int:
    """Mutate vocal pitch-down amount, clamped for phonk-like range."""
    delta = int(round(random.gauss(0, magnitude * 4)))
    return max(-8, min(-1, semitones + delta))


def _mutate_vocal_style(current: VocalChopStyle, probability: float) -> VocalChopStyle:
    """Possibly switch vocal style."""
    if random.random() < probability:
        options = [s for s in VocalChopStyle if s != current]
        return random.choice(options)
    return current


def _mutate_melody_profile(current: str, probability: float) -> str:
    """Occasionally switch melody blueprint for broader stylistic exploration."""
    if random.random() < probability:
        options = [p for p in MELODY_PROFILES if p != current]
        if options:
            return random.choice(options)
    return current


def _mutate_effects(current: list[EffectType], magnitude: float) -> list[EffectType]:
    """Mutate the effects list: add, remove, or swap effects."""
    effects = list(current)

    # Possibly remove an effect
    if effects and random.random() < magnitude * 0.5:
        effects.remove(random.choice(effects))

    # Possibly add an effect
    if random.random() < magnitude * 0.5:
        available = [e for e in ALL_EFFECTS if e not in effects]
        if available:
            effects.append(random.choice(available))

    # Possibly swap one effect
    if effects and random.random() < magnitude * 0.3:
        idx = random.randint(0, len(effects) - 1)
        available = [e for e in ALL_EFFECTS if e not in effects]
        if available:
            effects[idx] = random.choice(available)

    # Keep between 1-4 effects
    if len(effects) == 0:
        effects = [random.choice(ALL_EFFECTS)]
    elif len(effects) > 4:
        effects = random.sample(effects, 4)

    return effects


class EvolutionEngine:
    """Drives agent evolution based on battle performance."""

    def mutate_dna(self, dna: AgentDNA, magnitude: float) -> AgentDNA:
        """
        Create a mutated copy of an agent's DNA.

        Args:
            dna: The current DNA to mutate from.
            magnitude: 0.0 (no change) to 1.0 (major overhaul).
                       Typically:
                         - Winner: 0.05 - 0.15 (minor refinement)
                         - Close loser: 0.15 - 0.35 (moderate change)
                         - Big loser: 0.35 - 0.7 (major mutation)
        """
        new = deepcopy(dna)
        new.bass_intensity = _mutate_float(dna.bass_intensity, magnitude)
        new.cowbell_frequency = _mutate_float(dna.cowbell_frequency, magnitude)
        new.melody_complexity = _mutate_float(dna.melody_complexity, magnitude)
        new.hi_hat_density = _mutate_float(dna.hi_hat_density, magnitude)
        new.swing = _mutate_float(dna.swing, magnitude)
        new.sample_variation = _mutate_float(dna.sample_variation, magnitude)
        new.melody_profile = _mutate_melody_profile(dna.melody_profile, magnitude * 0.22)
        new.glide_probability = _mutate_float(dna.glide_probability, magnitude)
        new.darkness = _mutate_float(dna.darkness, magnitude)
        new.distortion_drive = _mutate_float(dna.distortion_drive, magnitude)
        new.vocal_pitch_down = _mutate_pitch_down(dna.vocal_pitch_down, magnitude)
        new.tempo = _mutate_tempo(dna.tempo, magnitude)
        new.vocal_chop_style = _mutate_vocal_style(dna.vocal_chop_style, magnitude * 0.5)
        new.effects = _mutate_effects(dna.effects, magnitude)
        return new

    def compute_mutation_magnitude(self, agent: Agent, battle_likes: int,
                                    avg_likes: float, won: bool) -> float:
        """
        Determine how much an agent should mutate based on performance.

        Logic:
        - Winners barely mutate (refine winning formula)
        - Close losers get moderate mutations
        - Agents far below average get aggressive mutations
        - Agents on losing streaks get extra pressure to change
        """
        if won:
            # Winner: small refinement
            return random.uniform(0.03, 0.12)

        if avg_likes == 0:
            return random.uniform(0.2, 0.4)

        # How far below average
        deficit_ratio = (avg_likes - battle_likes) / avg_likes
        deficit_ratio = max(0, min(1, deficit_ratio))

        # Base magnitude from deficit
        base = 0.15 + deficit_ratio * 0.5  # 0.15 to 0.65

        # Losing streak bonus
        recent_win_rate = agent.stats.win_rate
        if agent.stats.total_battles >= 5 and recent_win_rate < 0.3:
            base += 0.1  # Extra push for consistent losers

        return min(0.7, base)

    def evolve_after_battle(self, agents: list[Agent], battle_results: dict[str, int]) -> dict[str, dict]:
        """
        Evolve all agents after a battle round.

        Args:
            agents: List of agents that participated.
            battle_results: Dict mapping agent_id -> likes received.

        Returns:
            Dict mapping agent_id -> mutation info (magnitude, changed params).
        """
        total_likes = sum(battle_results.values())
        num_agents = len(agents)
        avg_likes = total_likes / num_agents if num_agents > 0 else 0

        # Determine winner
        winner_id = max(battle_results, key=battle_results.get)

        evolution_report: dict[str, dict] = {}

        for agent in agents:
            likes = battle_results.get(agent.id, 0)
            won = agent.id == winner_id

            # Record battle result
            agent.record_battle(likes, won)

            # Compute mutation magnitude
            magnitude = self.compute_mutation_magnitude(agent, likes, avg_likes, won)

            # Store old DNA for comparison
            old_dna = agent.dna.to_dict()

            # Mutate
            new_dna = self.mutate_dna(agent.dna, magnitude)
            agent.evolve(new_dna)

            # Build report
            new_dna_dict = new_dna.to_dict()
            changed = {
                k: {"old": old_dna[k], "new": new_dna_dict[k]}
                for k in old_dna
                if old_dna[k] != new_dna_dict[k]
            }

            evolution_report[agent.id] = {
                "agent_name": agent.name,
                "won": won,
                "likes": likes,
                "magnitude": round(magnitude, 3),
                "generation": agent.generation,
                "changed_params": changed,
            }

        return evolution_report
