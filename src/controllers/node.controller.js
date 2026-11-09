const { pool } = require("../config/db.js");
const { validateNodePayload } = require("../services/node-validation.js");
const {
  generateNodeCredential,
  hashNodeCredential,
} = require("../services/node-credentials.js");
const { recordNodeHeartbeat } = require("../services/node-availability.js");

const registerNode = async (req, res) => {
  const validation = validateNodePayload(req.body);
  if (validation.errors) {
    return res.status(400).json({
      success: false,
      message: "Invalid node registration data",
      errors: validation.errors,
    });
  }

  const { name, hostname, ip_address } = validation.value;
  const credential = generateNodeCredential();
  const credentialHash = hashNodeCredential(credential);

  try {
    const result = await pool.query(
      `WITH inserted_node AS (
         INSERT INTO nodes (name, hostname, ip_address)
         VALUES ($1, $2, $3)
         RETURNING id, name, hostname, ip_address, status, last_seen_at, created_at
       ), inserted_credential AS (
         INSERT INTO node_credentials (node_id, token_hash)
         SELECT id, $4 FROM inserted_node
         RETURNING node_id
       )
       SELECT * FROM inserted_node`,
      [name, hostname, ip_address, credentialHash],
    );

    return res.status(201).json({
      success: true,
      message: "Linux node registered successfully",
      node: result.rows[0],
      credential,
      credential_notice: "Store this credential securely; it will not be shown again.",
    });
  } catch (error) {
    console.error("Register node error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to register node",
    });
  }
};

const rotateNodeCredential = async (req, res) => {
  const credential = generateNodeCredential();
  const credentialHash = hashNodeCredential(credential);

  try {
    const result = await pool.query(
      `UPDATE node_credentials
       SET token_hash = $1, created_at = NOW(), revoked_at = NULL
       WHERE node_id = $2 AND token_hash = $3 AND revoked_at IS NULL
       RETURNING node_id`,
      [credentialHash, req.params.id, req.nodeCredentialHash],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Credential changed or revoked; authenticate again before rotating",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Node credential rotated successfully",
      credential,
      credential_notice: "Store this credential securely; it will not be shown again.",
    });
  } catch (error) {
    console.error("Rotate node credential error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to rotate node credential" });
  }
};

const revokeNodeCredential = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE node_credentials SET revoked_at = NOW()
       WHERE node_id = $1 AND token_hash = $2 AND revoked_at IS NULL
       RETURNING node_id`,
      [req.params.id, req.nodeCredentialHash],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Credential changed or already revoked",
      });
    }

    return res.status(200).json({ success: true, message: "Node credential revoked successfully" });
  } catch (error) {
    console.error("Revoke node credential error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to revoke node credential" });
  }
};

const getNodes = async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM nodes ORDER BY id ASC");

    return res.status(200).json({
      success: true,
      nodes: result.rows,
    });
  } catch (error) {
    console.error("List nodes error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to list nodes",
    });
  }
};

const heartbeatNode = async (req, res) => {
  try {
    const id = req.params.id;
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
      return res.status(400).json({
        success: false,
        message: "A valid node id is required",
      });
    }

    const updated = await recordNodeHeartbeat(pool, id);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Node not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Node heartbeat received successfully",
    });
  } catch (error) {
    console.error("Update node heartbeat error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update node heartbeat",
    });
  }
};

module.exports = {
  registerNode,
  getNodes,
  heartbeatNode,
  rotateNodeCredential,
  revokeNodeCredential,
};
