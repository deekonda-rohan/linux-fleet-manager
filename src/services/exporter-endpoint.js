const { isIP } = require("node:net");
const {
  setNodeExporterEndpoint,
} = require("../repositories/node-exporter.repository.js");

const HOSTNAME_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

function validateExporterAddress(input) {
  if (typeof input !== "string") {
    return { error: "Exporter address must be a hostname or IP address" };
  }

  const address = input.trim();
  if (address.length === 0 || address.length > 253) {
    return { error: "Exporter address must contain 1 to 253 characters" };
  }

  if (isIP(address) !== 0) {
    return { value: address };
  }

  const labels = address.endsWith(".")
    ? address.slice(0, -1).split(".")
    : address.split(".");
  if (labels.some((label) => !HOSTNAME_LABEL.test(label))) {
    return {
      error: "Exporter address must be a valid IPv4, IPv6, or DNS hostname",
    };
  }

  return { value: address };
}

function validateExporterPort(input) {
  const value = typeof input === "number" ? String(input) : input;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return { error: "Exporter port must be an integer from 1 to 65535" };
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "Exporter port must be an integer from 1 to 65535" };
  }

  return { value: port };
}

async function provisionExporterEndpoint(
  pool,
  nodeIdInput,
  addressInput,
  portInput,
) {
  if (typeof nodeIdInput !== "string" || !/^[1-9]\d*$/.test(nodeIdInput)) {
    return { error: "Node ID must be a positive integer" };
  }

  let nodeId;
  try {
    nodeId = BigInt(nodeIdInput);
    if (nodeId > 9223372036854775807n) {
      return { error: "Node ID is outside the PostgreSQL BIGINT range" };
    }
  } catch {
    return { error: "Node ID must be a positive integer" };
  }

  const address = validateExporterAddress(addressInput);
  if (address.error) return address;
  const port = validateExporterPort(portInput);
  if (port.error) return port;

  const node = await setNodeExporterEndpoint(
    pool,
    nodeIdInput,
    address.value,
    port.value,
  );
  if (!node) return { error: "Node not found", notFound: true };
  return { value: node };
}

module.exports = {
  validateExporterAddress,
  validateExporterPort,
  provisionExporterEndpoint,
};
