const { pool } = require("../config/db.js");

const registerNode = async (req, res) => {
  const { name, hostname, ip_address } = req.body ?? {};

  if (!name || !hostname || !ip_address) {
    return res.status(400).json({
      success: false,
      message: "name, hostname and ip_address are required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO nodes (name, hostname, ip_address)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, hostname, ip_address],
    );

    return res.status(201).json({
      success: true,
      message: "Linux node registered successfully",
      node: result.rows[0],
    });
  } catch (error) {
    console.error("Register node error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to register node",
    });
  }
};

const getNodes = async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM nodes ORDER BY id ASC",
    );

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
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid node id is required",
      });
    }

    const result = await pool.query(
      "UPDATE nodes SET status = 'online', last_seen_at = NOW() WHERE id = $1 RETURNING id",
      [id],
    );

    if (result.rowCount === 0) {
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
};
