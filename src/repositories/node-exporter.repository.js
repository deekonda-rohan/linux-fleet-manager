async function setNodeExporterEndpoint(
  pool,
  nodeId,
  exporterAddress,
  exporterPort,
) {
  const result = await pool.query(
    `UPDATE nodes
     SET exporter_address = $1, exporter_port = $2
     WHERE id = $3
     RETURNING id, name, exporter_address, exporter_port`,
    [exporterAddress, exporterPort, nodeId],
  );
  return result.rows[0] ?? null;
}

async function listNodesForPrometheus(pool) {
  const result = await pool.query(
    `SELECT id::text AS node_id, name AS node_name, status,
            exporter_address, exporter_port
     FROM nodes
     ORDER BY id ASC`,
  );
  return result.rows;
}

module.exports = { setNodeExporterEndpoint, listNodesForPrometheus };
