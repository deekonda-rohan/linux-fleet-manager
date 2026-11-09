CREATE TABLE IF NOT EXISTS node_credentials (
  node_id BIGINT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
