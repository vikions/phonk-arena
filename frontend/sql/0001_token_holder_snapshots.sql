CREATE TABLE IF NOT EXISTS token_holder_snapshots (
  token_address TEXT NOT NULL,
  snapshot_hour TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  holder_count INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (token_address, snapshot_hour)
);

CREATE INDEX IF NOT EXISTS token_holder_snapshots_lookup_idx
ON token_holder_snapshots (token_address, snapshot_hour DESC);
