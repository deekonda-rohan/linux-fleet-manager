ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS exporter_address TEXT,
  ADD COLUMN IF NOT EXISTS exporter_port INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nodes_exporter_address_format_check'
      AND conrelid = 'nodes'::regclass
  ) THEN
    ALTER TABLE nodes
      ADD CONSTRAINT nodes_exporter_address_format_check
      CHECK (
        exporter_address IS NULL OR
        (length(exporter_address) BETWEEN 1 AND 253
         AND exporter_address ~ '^[A-Za-z0-9.:-]+$')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nodes_exporter_port_range_check'
      AND conrelid = 'nodes'::regclass
  ) THEN
    ALTER TABLE nodes
      ADD CONSTRAINT nodes_exporter_port_range_check
      CHECK (exporter_port IS NULL OR exporter_port BETWEEN 1 AND 65535);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nodes_exporter_endpoint_pair_check'
      AND conrelid = 'nodes'::regclass
  ) THEN
    ALTER TABLE nodes
      ADD CONSTRAINT nodes_exporter_endpoint_pair_check
      CHECK (
        (exporter_address IS NULL AND exporter_port IS NULL) OR
        (exporter_address IS NOT NULL AND exporter_port IS NOT NULL)
      );
  END IF;
END;
$$;
