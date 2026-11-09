async function findCommandTarget(pool, nodeId) {
  const result = await pool.query(
    `SELECT id::text AS id, name, host(ip_address) AS target_host
     FROM nodes
     WHERE id = $1`,
    [nodeId],
  );
  return result.rows[0] ?? null;
}

async function createCommandAudit(pool, { nodeId, nodeName, targetHost, operation }) {
  const result = await pool.query(
    `INSERT INTO remote_command_audit
       (node_id, node_name, target_host, operation, status)
     VALUES ($1, $2, $3, $4, 'running')
     RETURNING id::text AS id`,
    [nodeId, nodeName, targetHost, operation],
  );
  return result.rows[0].id;
}

async function finishCommandAudit(pool, { auditId, status, exitCode, errorCode }) {
  await pool.query(
    `UPDATE remote_command_audit
     SET status = $1, completed_at = NOW(), exit_code = $2, error_code = $3
     WHERE id = $4`,
    [status, exitCode, errorCode, auditId],
  );
}

module.exports = { findCommandTarget, createCommandAudit, finishCommandAudit };
