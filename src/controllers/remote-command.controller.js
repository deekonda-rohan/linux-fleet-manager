const { pool } = require("../config/db.js");
const {
  findCommandTarget,
  createCommandAudit,
  finishCommandAudit,
  listCommandHistory,
} = require("../repositories/remote-command.repository.js");
const {
  APPROVED_OPERATIONS,
  runApprovedRemoteOperation,
} = require("../services/remote-operations.js");
const { FLEET_SSH_TIMEOUT_MS, getNodeSshConfig } = require("../config/ssh.js");

const DEFAULT_HISTORY_LIMIT = 25;
const MAX_HISTORY_LIMIT = 100;
const MAX_HISTORY_OFFSET = 2147483647;

function parseHistoryQuery(query) {
  let nodeId;
  if (query.node_id !== undefined) {
    if (typeof query.node_id !== "string"
      || !/^[1-9]\d{0,18}$/.test(query.node_id)
      || BigInt(query.node_id) > 9223372036854775807n) {
      return { error: "node_id must be a valid positive node ID" };
    }
    nodeId = query.node_id;
  }

  let limit = DEFAULT_HISTORY_LIMIT;
  if (query.limit !== undefined) {
    if (typeof query.limit !== "string" || !/^\d+$/.test(query.limit)) {
      return { error: `limit must be an integer from 1 to ${MAX_HISTORY_LIMIT}` };
    }
    limit = Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HISTORY_LIMIT) {
      return { error: `limit must be an integer from 1 to ${MAX_HISTORY_LIMIT}` };
    }
  }

  let offset = 0;
  if (query.offset !== undefined) {
    if (typeof query.offset !== "string" || !/^\d+$/.test(query.offset)) {
      return { error: `offset must be an integer from 0 to ${MAX_HISTORY_OFFSET}` };
    }
    offset = Number(query.offset);
    if (!Number.isSafeInteger(offset) || offset > MAX_HISTORY_OFFSET) {
      return { error: `offset must be an integer from 0 to ${MAX_HISTORY_OFFSET}` };
    }
  }

  const allowed = new Set(["node_id", "limit", "offset"]);
  if (Object.keys(query).some((key) => !allowed.has(key))) {
    return { error: "Only node_id, limit, and offset query parameters are supported" };
  }

  return { value: { nodeId, limit, offset } };
}

async function getCommandHistory(req, res) {
  const parsed = parseHistoryQuery(req.query);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }

  try {
    const result = await listCommandHistory(pool, parsed.value);
    return res.status(200).json({
      success: true,
      history: result.records,
      pagination: {
        limit: parsed.value.limit,
        offset: parsed.value.offset,
        total: result.total,
      },
    });
  } catch (error) {
    console.error("List command history error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to list command history" });
  }
}

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

  try {
    const node = await findCommandTarget(pool, nodeId);
    if (!node) return res.status(404).json({ success: false, message: "Node not found" });

    const ssh = getNodeSshConfig(node.id);
    if (ssh.error) {
      return res.status(503).json({ success: false, message: ssh.error });
    }

    const auditId = await createCommandAudit(pool, {
      nodeId: node.id,
      nodeName: node.name,
      targetHost: node.target_host,
      operation: body.operation,
    });

    const result = await runApprovedRemoteOperation({
      host: node.target_host,
      sshUser: ssh.config.sshUser,
      sshKeyPath: ssh.config.sshKeyPath,
      operation: body.operation,
      timeoutMs: FLEET_SSH_TIMEOUT_MS,
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
        stderr: result.stderr,
      });
    }

    return res.status(200).json({
      success: true,
      node_id: node.id,
      node_name: node.name,
      operation: body.operation,
      status: result.status,
      output: result.output,
      stderr: result.stderr,
    });
  } catch (error) {
    console.error("Remote operation request failed:", error.message);
    return res.status(500).json({ success: false, message: "Failed to execute remote operation" });
  }
}

module.exports = { runRemoteOperation, getCommandHistory, parseHistoryQuery };
