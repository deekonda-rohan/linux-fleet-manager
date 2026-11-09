const test = require("node:test");
const assert = require("node:assert/strict");
const { formatPrometheusTarget, buildPrometheusTargetGroups, generatePrometheusDiscoveryJson } = require("../src/services/prometheus-discovery.js");
const { listNodesForPrometheus } = require("../src/repositories/node-exporter.repository.js");

test("formats IPv4, hostname, and IPv6 targets correctly", () => {
  assert.equal(formatPrometheusTarget("192.0.2.20", 9100), "192.0.2.20:9100");
  assert.equal(formatPrometheusTarget("node-01.example.com", 9100), "node-01.example.com:9100");
  assert.equal(formatPrometheusTarget("2001:db8::1", 9100), "[2001:db8::1]:9100");
});

test("generates target groups with node ID and name labels", () => {
  const groups = buildPrometheusTargetGroups([{
    node_id: "42",
    node_name: "linux-node-01",
    exporter_address: "localhost",
    exporter_port: 9100,
    status: "online",
  }]);
  assert.deepEqual(groups, [{
    targets: ["localhost:9100"],
    labels: { node_id: "42", node_name: "linux-node-01" },
  }]);
});

test("keeps configured offline nodes and omits unconfigured nodes", () => {
  const groups = buildPrometheusTargetGroups([
    { node_id: "1", node_name: "offline-node", status: "offline", exporter_address: "localhost", exporter_port: 9100 },
    { node_id: "2", node_name: "not-configured", status: "online", exporter_address: null, exporter_port: null },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].labels.node_name, "offline-node");
});

test("serializes labels as JSON without including unrelated credential fields", () => {
  const json = generatePrometheusDiscoveryJson([{
    node_id: "3",
    node_name: 'node "quoted"',
    exporter_address: "localhost",
    exporter_port: 9100,
    token_hash: "sensitive-test-value",
  }]);
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].labels.node_name, 'node "quoted"');
  assert.equal(json.includes("sensitive-test-value"), false);
});

test("rejects partial or invalid configured endpoint data", () => {
  assert.throws(() => buildPrometheusTargetGroups([{
    node_id: "4", node_name: "partial", exporter_address: "localhost", exporter_port: null,
  }]), /incomplete exporter endpoint/);
  assert.throws(() => buildPrometheusTargetGroups([{
    node_id: "5", node_name: "invalid", exporter_address: "http://localhost", exporter_port: 9100,
  }]), /valid IPv4, IPv6, or DNS hostname/);
});

test("repository reads every node without filtering offline status", async () => {
  let queryText;
  const expected = [{ node_id: "6", node_name: "offline", status: "offline", exporter_address: "localhost", exporter_port: 9101 }];
  const rows = await listNodesForPrometheus({
    async query(sql) { queryText = sql; return { rows: expected }; },
  });
  assert.deepEqual(rows, expected);
  assert.match(queryText, /FROM nodes/);
  assert.doesNotMatch(queryText, /WHERE\s+status/i);
});
