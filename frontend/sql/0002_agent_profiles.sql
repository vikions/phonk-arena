CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_id SMALLINT PRIMARY KEY,
  mutation_version INTEGER NOT NULL,
  bpm_range INTEGER NOT NULL,
  layer_density INTEGER NOT NULL,
  glitch_intensity INTEGER NOT NULL,
  bass_weight INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'postgres',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_epoch_progressions (
  epoch_id BIGINT PRIMARY KEY,
  winner_agent_id SMALLINT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_mutation_history (
  id BIGSERIAL PRIMARY KEY,
  epoch_id BIGINT NOT NULL,
  agent_id SMALLINT NOT NULL,
  winner_agent_id SMALLINT NOT NULL,
  did_win BOOLEAN NOT NULL,
  old_mutation_version INTEGER NOT NULL,
  new_mutation_version INTEGER NOT NULL,
  old_bpm_range INTEGER NOT NULL,
  new_bpm_range INTEGER NOT NULL,
  old_layer_density INTEGER NOT NULL,
  new_layer_density INTEGER NOT NULL,
  old_glitch_intensity INTEGER NOT NULL,
  new_glitch_intensity INTEGER NOT NULL,
  old_bass_weight INTEGER NOT NULL,
  new_bass_weight INTEGER NOT NULL,
  old_wins INTEGER NOT NULL,
  new_wins INTEGER NOT NULL,
  old_losses INTEGER NOT NULL,
  new_losses INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (epoch_id, agent_id)
);
