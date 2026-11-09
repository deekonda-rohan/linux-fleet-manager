const { pool } = require("../config/db.js");
const {
  findCommandTarget,
  createCommandAudit,
  finishCommandAudit,
} = require("../repositories/remote-command.repository.js");
const { APPROVED_OPERATIONS, runApprovedRemoteOperation } = require("../services/remote-operations.js");

async function runRemoteOperation(req, res) {
  const nodeId = req.params.id;
  if (!/^[1-9]\d{0,18}$/.test(nodeId) || BigInt(nodeId) > 9223372036854775807n) {
    return res.status(400).json({ success: false, message: "A valid node id is required" });
  }

  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (!Object.hasOwn(APPROVED_OPERATIONS, body.operation) || Object.keys(body).some((key) => key !== "operation")) {
    return res.status(400).json({
      success: false,
      message: "operation must be one of the approved diagnostic operations",
      allowed_operations: Object.keys(APPROVED_OPERATIONS),
    });
  }

  const sshUser = process.env.FLEET_SSH_USER;
  if (typeof sshUser !== "string" || !/^[a-z_][a-z0-9_-]{0,31}$/.test(sshUser)) {
    return res.status(503).json({ success: false, message: "SSH operator user is not configured" });
  }

  try {
    const node = await findCommandTarget(pool, nodeId);
    if (!node) return res.status(404).json({ success: false, message: "Node not found" });

    const auditId = await createCommandAudit(pool, {
      nodeId: node.id,
      nodeName: node.name,
      targetHost: node.target_host,
      operation: body.operation,
    });

    const result = await runApprovedRemoteOperation({
      host: node.target_host,
      sshUser,
      operation: body.operation,
    });

    try {
      await finishCommandAudit(pool, {
        auditId,
        status: result.status,
        exitCode: result.exitCode,
        errorCode: result.errorCode,
      });
    } catch (error) {
      console.error("Remote command audit completion failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Remote operation completed, but its audit result could not be stored",
      });
    }

    if (result.status !== "succeeded") {
      return res.status(result.status === "timed_out" ? 504 : 502).json({
        success: false,
        node_id: node.id,
        operation: body.operation,
        status: result.status,
        code: result.errorCode,
        exit_code: result.exitCode,
        output: result.output,
      });
    }

    return res.status(200).json({
      success: true,
      node_id: node.id,
      node_name: node.name,
      operation: body.operation,
      status: result.status,
      output: result.output,
    });
  } catch (error) {
    console.error("Remote operation request failed:", error.message);
    return res.status(500).json({ success: false, message: "Failed to execute remote operation" });
  }
}

module.exports = { runRemoteOperation };
