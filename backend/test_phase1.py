"""
Phase 1 Test Script for PhonkArena.

1. Generate sample library
2. Create 3 agents with different starting DNA
3. Generate a track for each agent
4. Simulate 5 battle rounds with evolution
5. Show how agents evolve over time
"""

import json
import random
import sys
from pathlib import Path

# Ensure app package is importable
sys.path.insert(0, str(Path(__file__).parent))

from app.models.agent import Agent, AgentDNA, VocalChopStyle, EffectType
from app.services.sample_generator import generate_all_samples
from app.services.music_generator import TrackGenerator
from app.services.evolution_engine import EvolutionEngine

OUTPUT_DIR = Path(__file__).parent / "output"
SAMPLES_DIR = Path(__file__).parent / "samples"


def unique_output_path(path: Path) -> Path:
    """Avoid overwriting files that may be read-only/locked in this environment."""
    if not path.exists():
        return path
    for idx in range(1, 1000):
        candidate = path.with_name(f"{path.stem}_{idx}{path.suffix}")
        if not candidate.exists():
            return candidate
    return path.with_name(f"{path.stem}_{random.randint(1000, 9999)}{path.suffix}")


def create_starting_agents() -> list[Agent]:
    """Create the 3 starting agents from the spec."""
    bass_demon = Agent(
        id="agent_01",
        name="Bass Demon",
        description="Heavy 808s, minimal melody, pure power",
        dna=AgentDNA(
            bass_intensity=0.95,
            cowbell_frequency=0.3,
            vocal_chop_style=VocalChopStyle.AGGRESSIVE,
            tempo=145,
            melody_complexity=0.2,
            effects=[EffectType.DISTORTION_HEAVY, EffectType.SIDECHAIN_HARD],
            hi_hat_density=0.7,
            swing=0.1,
            sample_variation=0.3,
            sample_pack="landr",
            melody_profile="acido_slowed",
            glide_probability=0.35,
            darkness=0.85,
            distortion_drive=0.9,
            vocal_pitch_down=-5,
        ),
    )

    memphis_soul = Agent(
        id="agent_02",
        name="Memphis Soul",
        description="Vocal samples, melodic, nostalgic",
        dna=AgentDNA(
            bass_intensity=0.4,
            cowbell_frequency=0.7,
            vocal_chop_style=VocalChopStyle.MEMPHIS,
            tempo=135,
            melody_complexity=0.85,
            effects=[EffectType.REVERB_HALL, EffectType.VINYL_CRACKLE],
            hi_hat_density=0.5,
            swing=0.3,
            sample_variation=0.6,
            sample_pack="bandlab",
            melody_profile="memphis_classic",
            glide_probability=0.25,
            darkness=0.65,
            distortion_drive=0.45,
            vocal_pitch_down=-3,
        ),
    )

    drift_king = Agent(
        id="agent_03",
        name="Drift King",
        description="Balanced aggression, high energy",
        dna=AgentDNA(
            bass_intensity=0.7,
            cowbell_frequency=0.9,
            vocal_chop_style=VocalChopStyle.MINIMAL,
            tempo=150,
            melody_complexity=0.5,
            effects=[EffectType.PITCH_SHIFT, EffectType.REVERB_LIGHT],
            hi_hat_density=0.85,
            swing=0.0,
            sample_variation=0.5,
            sample_pack="lunatic",
            melody_profile="drift_night",
            glide_probability=0.3,
            darkness=0.75,
            distortion_drive=0.65,
            vocal_pitch_down=-4,
        ),
    )

    return [bass_demon, memphis_soul, drift_king]


def simulate_votes(num_agents: int) -> list[int]:
    """Simulate user votes for a battle (random with some bias)."""
    # Random vote counts between 5-50
    votes = [random.randint(5, 50) for _ in range(num_agents)]
    return votes


def main():
    print("=" * 60)
    print("  PHONK ARENA - Phase 1 Test")
    print("=" * 60)

    # Step 1: Generate sample library
    print("\n[1/5] Generating sample library...")
    sample_paths = generate_all_samples(SAMPLES_DIR)
    total_samples = sum(len(v) for v in sample_paths.values())
    print(f"  Generated {total_samples} samples across {len(sample_paths)} categories")
    for cat, paths in sample_paths.items():
        print(f"    {cat}: {len(paths)} samples")

    # Step 2: Create agents
    print("\n[2/5] Creating agents...")
    agents = create_starting_agents()
    for agent in agents:
        print(f"  {agent.name} ({agent.id})")
        print(f"    Bass: {agent.dna.bass_intensity}, Tempo: {agent.dna.tempo} BPM")
        print(f"    Style: {agent.dna.vocal_chop_style.value}, Melody: {agent.dna.melody_complexity}")
        print(f"    Profile: {agent.dna.melody_profile}, Sample pack: {agent.dna.sample_pack}")

    # Step 3: Generate initial tracks
    print("\n[3/5] Generating tracks for each agent...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    generator = TrackGenerator(SAMPLES_DIR)
    print(f"  Available sample packs: {', '.join(generator.get_available_packs())}")

    for agent in agents:
        if not generator.has_sample_pack(agent.dna.sample_pack):
            print(f"  ! {agent.name}: sample pack '{agent.dna.sample_pack}' not found, fallback to available packs")
        output_path = OUTPUT_DIR / f"{agent.id}_{agent.name.lower().replace(' ', '_')}_gen{agent.generation}.wav"
        output_path = unique_output_path(output_path)
        events_path = output_path.with_suffix(".events.json")
        generator.generate_and_save(
            agent.dna,
            output_path,
            duration=10.0,
            seed=42,
            events_path=events_path,
        )
        print(f"  {agent.name}: {output_path.name}")

    # Step 4: Simulate 5 battle rounds with evolution
    print("\n[4/5] Simulating 5 battle rounds...")
    evo_engine = EvolutionEngine()

    for round_num in range(1, 6):
        print(f"\n  --- Battle Round {round_num} ---")

        # Simulate votes
        votes = simulate_votes(len(agents))
        battle_results = {agent.id: v for agent, v in zip(agents, votes)}

        for agent, v in zip(agents, votes):
            print(f"    {agent.name}: {v} votes", end="")
            if v == max(votes):
                print(" (WINNER)", end="")
            print()

        # Evolve
        report = evo_engine.evolve_after_battle(agents, battle_results)

        for agent_id, info in report.items():
            name = info["agent_name"]
            mag = info["magnitude"]
            gen = info["generation"]
            n_changed = len(info["changed_params"])
            status = "WON" if info["won"] else "LOST"
            print(f"    {name}: {status} | mutation={mag:.3f} | gen={gen} | {n_changed} params changed")

    # Step 5: Generate post-evolution tracks
    print("\n[5/5] Generating post-evolution tracks...")
    for agent in agents:
        output_path = OUTPUT_DIR / f"{agent.id}_{agent.name.lower().replace(' ', '_')}_gen{agent.generation}.wav"
        output_path = unique_output_path(output_path)
        events_path = output_path.with_suffix(".events.json")
        generator.generate_and_save(
            agent.dna,
            output_path,
            duration=10.0,
            seed=None,
            events_path=events_path,
        )
        print(f"  {agent.name} (Gen {agent.generation}): {output_path.name}")

    # Summary
    print("\n" + "=" * 60)
    print("  EVOLUTION SUMMARY")
    print("=" * 60)
    for agent in agents:
        print(f"\n  {agent.name}:")
        print(f"    Generation: {agent.generation}")
        print(f"    Win Rate: {agent.stats.win_rate:.1%} ({agent.stats.wins}/{agent.stats.total_battles})")
        print(f"    Total Likes: {agent.stats.total_likes}")
        print(f"    Current DNA:")
        dna = agent.dna.to_dict()
        for k, v in dna.items():
            if k != "effects":
                print(f"      {k}: {v}")
            else:
                print(f"      effects: {', '.join(v)}")

    # Save final state
    state = {agent.id: agent.to_dict() for agent in agents}
    state_path = unique_output_path(OUTPUT_DIR / "final_state.json")
    with open(state_path, "w") as f:
        json.dump(state, f, indent=2)
    print(f"\n  Final state saved to: {state_path}")

    print("\n" + "=" * 60)
    print("  Phase 1 Complete!")
    print(f"  Check {OUTPUT_DIR} for generated WAV files")
    print("=" * 60)


if __name__ == "__main__":
    main()
