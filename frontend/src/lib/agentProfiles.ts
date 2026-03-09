import { DEFAULT_DNA } from "@/lib/musicEngine";

export type AgentProfileSource = "postgres" | "seed" | "default" | "contract";

export interface AgentRuntimeProfile {
  mutationVersion: number;
  bpmRange: number;
  layerDensity: number;
  glitchIntensity: number;
  bassWeight: number;
  wins: number;
  losses: number;
  source: AgentProfileSource;
  updatedAt: string | null;
}

export type ArenaAgentId = 0 | 1 | 2 | 3;

export function defaultAgentRuntimeProfile(agentId: ArenaAgentId): AgentRuntimeProfile {
  const dna = DEFAULT_DNA[agentId];

  return {
    mutationVersion: dna.mutationVersion,
    bpmRange: dna.bpmRange,
    layerDensity: dna.layerDensity,
    glitchIntensity: dna.glitchIntensity,
    bassWeight: dna.bassWeight,
    wins: 0,
    losses: 0,
    source: "default",
    updatedAt: null,
  };
}

export function defaultAgentRuntimeProfiles(): Record<ArenaAgentId, AgentRuntimeProfile> {
  return {
    0: defaultAgentRuntimeProfile(0),
    1: defaultAgentRuntimeProfile(1),
    2: defaultAgentRuntimeProfile(2),
    3: defaultAgentRuntimeProfile(3),
  };
}
