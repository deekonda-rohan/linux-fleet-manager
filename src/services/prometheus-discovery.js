const { isIP } = require("node:net");
const {
  validateExporterAddress,
  validateExporterPort,
} = require("./exporter-endpoint.js");

function formatPrometheusTarget(addressInput, portInput) {
  const address = validateExporterAddress(addressInput);
  const port = validateExporterPort(portInput);
  if (address.error || port.error) {
    throw new Error(address.error || port.error);
  }

  const host = address.value;
  return isIP(host) === 6 ? `[${host}]:${port.value}` : `${host}:${port.value}`;
}

function buildPrometheusTargetGroups(nodes) {
  if (!Array.isArray(nodes)) {
    throw new TypeError("Discovery nodes must be an array");
  }

  const groups = [];
  for (const node of nodes) {
    const addressIsNull =
      node.exporter_address === null || node.exporter_address === undefined;
    const portIsNull =
      node.exporter_port === null || node.exporter_port === undefined;
    if (addressIsNull && portIsNull) continue;
    if (addressIsNull !== portIsNull) {
      throw new Error(
        `Node ${node.node_id} has an incomplete exporter endpoint`,
      );
    }
    const nodeId = String(node.node_id ?? "");
    if (!/^[1-9]\d*$/.test(nodeId) || BigInt(nodeId) > 9223372036854775807n) {
      throw new Error("A configured exporter endpoint has an invalid node ID");
    }
    if (
      typeof node.node_name !== "string" ||
      node.node_name.trim().length === 0
    ) {
      throw new Error(`Node ${node.node_id} has an invalid name`);
    }

    groups.push({
      targets: [
        formatPrometheusTarget(node.exporter_address, node.exporter_port),
      ],
      labels: {
        node_id: nodeId,
        node_name: node.node_name,
      },
    });
  }
  return groups;
}

function generatePrometheusDiscoveryJson(nodes) {
  return `${JSON.stringify(buildPrometheusTargetGroups(nodes), null, 2)}\n`;
}

module.exports = {
  formatPrometheusTarget,
  buildPrometheusTargetGroups,
  generatePrometheusDiscoveryJson,
};
