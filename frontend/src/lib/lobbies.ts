import type { LobbyConfig, LobbyId } from "@/lib/types";

export const LOBBY_IDS: LobbyId[] = ["drift-hard", "soft-night", "chaos-lab"];

export const LOBBY_CONFIGS: Record<LobbyId, LobbyConfig> = {
  "drift-hard": {
    lobbyId: "drift-hard",
    displayName: "Drift HARD",
    description: "High pressure drift lines, hard-bias drums, and aggressive adaptation.",
    tag: "HARD",
    agentA: {
      personaName: "Turbo Ronin",
      baseStyle: "HARD",
      strategy: "AGGRESSIVE",
    },
    agentB: {
      personaName: "Chrome Reaper",
      baseStyle: "HARD",
      strategy: "ADAPTIVE",
    },
    parameters: {
      mutationSensitivity: 0.62,
      intensityRange: { min: 0.62, max: 0.98 },
      bpmBias: 16,
      chaosRate: 0.12,
      styleBias: 0.75,
      densityBias: 0.2,
      fxBias: -0.1,
    },
  },
  "soft-night": {
    lobbyId: "soft-night",
    displayName: "Soft Night",
    description: "Atmospheric night drive with smoother bass, lower tempo, and soft textures.",
    tag: "SOFT",
    agentA: {
      personaName: "Velvet Ghost",
      baseStyle: "SOFT",
      strategy: "SAFE",
    },
    agentB: {
      personaName: "Moonline Echo",
      baseStyle: "SOFT",
      strategy: "ADAPTIVE",
    },
    parameters: {
      mutationSensitivity: 0.38,
      intensityRange: { min: 0.28, max: 0.72 },
      bpmBias: -10,
      chaosRate: 0.08,
      styleBias: -0.72,
      densityBias: -0.16,
      fxBias: 0.28,
    },
  },
  "chaos-lab": {
    lobbyId: "chaos-lab",
    displayName: "Chaos Lab",
    description: "Rapid mutation arena with frequent style flips and unstable groove experiments.",
    tag: "CHAOS",
    agentA: {
      personaName: "Rift Vector",
      baseStyle: "HARD",
      strategy: "ADAPTIVE",
    },
    agentB: {
      personaName: "Null Mirage",
      baseStyle: "SOFT",
      strategy: "AGGRESSIVE",
    },
    parameters: {
      mutationSensitivity: 0.86,
      intensityRange: { min: 0.35, max: 0.95 },
      bpmBias: 4,
      chaosRate: 0.45,
      styleBias: 0,
      densityBias: 0.3,
      fxBias: 0.18,
    },
  },
};

export function isLobbyId(value: string): value is LobbyId {
  return Object.prototype.hasOwnProperty.call(LOBBY_CONFIGS, value);
}

export function getLobbyConfig(lobbyId: LobbyId): LobbyConfig {
  return LOBBY_CONFIGS[lobbyId];
}

export function getDefaultLobbyId(): LobbyId {
  return LOBBY_IDS[0];
}