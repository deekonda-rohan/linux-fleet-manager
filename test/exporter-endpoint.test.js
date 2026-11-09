const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateExporterAddress,
  validateExporterPort,
  provisionExporterEndpoint,
} = require("../src/services/exporter-endpoint.js");

test("accepts IPv4, DNS hostnames, and IPv6 exporter addresses", () => {
  assert.equal(validateExporterAddress("192.0.2.20").value, "192.0.2.20");
  assert.equal(validateExporterAddress("node-01.example.com").value, "node-01.example.com");
  assert.equal(validateExporterAddress("::1").value, "::1");
});

test("rejects unsafe or malformed exporter addresses", () => {
  for (const address of ["", "http://node.example", "node/path", "bad_name", "bad..name", "-host"]) {
    assert.ok(validateExporterAddress(address).error, `expected ${address} to be rejected`);
  }
});

test("accepts port boundaries and rejects invalid ports", () => {
  assert.equal(validateExporterPort("1").value, 1);
  assert.equal(validateExporterPort("65535").value, 65535);
  for (const port of ["0", "65536", "-1", "1.5", "abc", ""]) {
    assert.ok(validateExporterPort(port).error, `expected ${port} to be rejected`);
  }
});

test("provisions only an existing node and uses parameterized SQL", async () => {
  let queryArgs;
  const pool = {
    async query(sql, values) {
      assert.match(sql, /UPDATE nodes/);
      assert.match(sql, /WHERE id = \$3/);
      queryArgs = values;
      return { rows: [{ id: "7", name: "node-7", exporter_address: values[0], exporter_port: values[1] }] };
    },
  };
  const result = await provisionExporterEndpoint(pool, "7", "localhost", "9101");
  assert.equal(result.value.id, "7");
  assert.deepEqual(queryArgs, ["localhost", 9101, "7"]);
});

test("reports missing nodes and avoids SQL for invalid endpoint input", async () => {
  let queries = 0;
  const pool = { async query() { queries += 1; return { rows: [] }; } };
  const missing = await provisionExporterEndpoint(pool, "999", "localhost", "9100");
  assert.deepEqual(missing, { error: "Node not found", notFound: true });
  const invalid = await provisionExporterEndpoint(pool, "999", "http://localhost", "9100");
  assert.ok(invalid.error);
  assert.equal(queries, 1);
});
