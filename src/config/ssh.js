const path = require("node:path");

const DEFAULT_SSH_TIMEOUT_MS = 10000;
const MAX_SSH_TIMEOUT_MS = 120000;
const SSH_USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

function isAbsoluteKeyPath(value) {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\0")) return false;
  return (process.platform === "win32" ? path.win32 : path).isAbsolute(value);
}

function parseNodeSshConfig(value) {
  if (value === undefined || value === "") return { nodes: {}, error: null };
  let input;
  try {
    input = JSON.parse(value);
  } catch {
    return { nodes: null, error: "FLEET_SSH_NODES must contain valid JSON" };
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { nodes: null, error: "FLEET_SSH_NODES must be a JSON object keyed by node ID" };
  }

  const nodes = Object.create(null);
  for (const [nodeId, config] of Object.entries(input)) {
    if (!/^[1-9]\d{0,18}$/.test(nodeId) || BigInt(nodeId) > 9223372036854775807n) {
      return { nodes: null, error: "FLEET_SSH_NODES contains an invalid node ID" };
    }
    if (!config || typeof config !== "object" || Array.isArray(config)
      || Object.keys(config).some((key) => !["sshUser", "sshKeyPath"].includes(key))) {
      return { nodes: null, error: `FLEET_SSH_NODES entry ${nodeId} must contain only sshUser and sshKeyPath` };
    }
    if (typeof config.sshUser !== "string" || !SSH_USER_PATTERN.test(config.sshUser)) {
      return { nodes: null, error: `FLEET_SSH_NODES entry ${nodeId} has an invalid SSH username` };
    }
    if (!isAbsoluteKeyPath(config.sshKeyPath)) {
      return { nodes: null, error: `FLEET_SSH_NODES entry ${nodeId} must have an absolute private key path` };
    }
    nodes[nodeId] = Object.freeze({ sshUser: config.sshUser, sshKeyPath: config.sshKeyPath });
  }
  return { nodes: Object.freeze(nodes), error: null };
}

function getNodeSshConfig(nodeId, value = process.env.FLEET_SSH_NODES) {
  const parsed = parseNodeSshConfig(value);
  if (parsed.error) return { config: null, error: parsed.error };
  return parsed.nodes[nodeId]
    ? { config: parsed.nodes[nodeId], error: null }
    : { config: null, error: "SSH configuration is not available for this node" };
}

function parseSshTimeoutMs(value) {
  if (value === undefined) return DEFAULT_SSH_TIMEOUT_MS;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("FLEET_SSH_TIMEOUT_MS must be an integer from 1 to 120000");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_SSH_TIMEOUT_MS) {
    throw new Error("FLEET_SSH_TIMEOUT_MS must be an integer from 1 to 120000");
  }
  return parsed;
}

const FLEET_SSH_TIMEOUT_MS = parseSshTimeoutMs(process.env.FLEET_SSH_TIMEOUT_MS);

module.exports = {
  DEFAULT_SSH_TIMEOUT_MS,
  MAX_SSH_TIMEOUT_MS,
  FLEET_SSH_TIMEOUT_MS,
  parseSshTimeoutMs,
  parseNodeSshConfig,
  getNodeSshConfig,
};
