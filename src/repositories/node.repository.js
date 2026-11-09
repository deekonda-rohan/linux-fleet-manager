const SAFE_NODE_FIELDS = `id::text AS id, name, hostname, host(ip_address) AS ip_address,
  status, last_seen_at, created_at, exporter_address, exporter_port`;

async function listNodes(pool) {
  const result = await pool.query(
    `SELECT ${SAFE_NODE_FIELDS} FROM nodes ORDER BY id ASC`,
  );
  return result.rows;
}

async function findNodeById(pool, nodeId) {
  const result = await pool.query(
    `SELECT ${SAFE_NODE_FIELDS} FROM nodes WHERE id = $1`,
    [nodeId],
  );
  return result.rows[0] ?? null;
}

module.exports = { listNodes, findNodeById };
