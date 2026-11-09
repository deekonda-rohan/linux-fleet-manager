const test = require("node:test");
const assert = require("node:assert/strict");
const { validateNodePayload } = require("../src/services/node-validation.js");

test("accepts valid node data and trims surrounding whitespace", () => {
  assert.deepEqual(validateNodePayload({
    name: "  worker one ",
    hostname: " node-01.example.com ",
    ip_address: " 192.0.2.10 ",
  }), {
    value: {
      name: "worker one",
      hostname: "node-01.example.com",
      ip_address: "192.0.2.10",
    },
  });
});

test("accepts IPv6 addresses and single-label hostnames", () => {
  assert.deepEqual(validateNodePayload({
    name: "worker",
    hostname: "localhost",
    ip_address: "2001:db8::1",
  }).errors, undefined);
});

test("reports missing fields", () => {
  assert.deepEqual(validateNodePayload({}).errors, {
    name: "name is required and must be a non-empty string",
    hostname: "hostname is required and must be a non-empty string",
    ip_address: "ip_address is required and must be a non-empty string",
  });
});

test("rejects invalid types, long names, malformed hostnames, and invalid IPs", () => {
  const result = validateNodePayload({
    name: "n".repeat(101),
    hostname: "bad_name.example.com",
    ip_address: "999.1.2.3",
  });
  assert.deepEqual(Object.keys(result.errors).sort(), ["hostname", "ip_address", "name"]);
  assert.equal(validateNodePayload({ name: 1, hostname: [], ip_address: null }).errors.name,
    "name is required and must be a non-empty string");
});

test("rejects a non-object body", () => {
  assert.equal(Object.keys(validateNodePayload("invalid").errors).length, 3);
});
