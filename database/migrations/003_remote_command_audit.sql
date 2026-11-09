CREATE TABLE IF NOT EXISTS remote_command_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_id BIGINT REFERENCES nodes(id) ON DELETE SET NULL,
  node_name TEXT NOT NULL,
  target_host TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('uptime', 'disk_usage', 'memory_usage', 'kernel_info')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'timed_out')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  exit_code INTEGER,
  error_code TEXT,
  CHECK (
    (status = 'running' AND completed_at IS NULL) OR
    (status <> 'running' AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS remote_command_audit_node_requested_idx
  ON remote_command_audit (node_id, requested_at DESC);
