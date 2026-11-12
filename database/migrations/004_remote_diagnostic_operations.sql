BEGIN;

ALTER TABLE remote_command_audit
  DROP CONSTRAINT IF EXISTS remote_command_audit_operation_check;

ALTER TABLE remote_command_audit
  ADD CONSTRAINT remote_command_audit_operation_check
  CHECK (operation IN (
    'uptime',
    'disk_usage',
    'memory_usage',
    'kernel_info',
    'disk_usage_all',
    'memory_usage_mb',
    'node_exporter_status'
  ));

COMMIT;
