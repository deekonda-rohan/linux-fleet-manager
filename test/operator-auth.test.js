const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { verifyFleetOperatorBearer } = require("../src/middleware/require-fleet-operator.js");

test("accepts the configured operator bearer token", () => {
  const token = randomBytes(32).toString("base64url");
  assert.deepEqual(verifyFleetOperatorBearer(`Bearer ${token}`, token), { authorized: true });
});

test("rejects missing, invalid, and unconfigured operator credentials", () => {
  const token = randomBytes(32).toString("base64url");
  assert.equal(verifyFleetOperatorBearer(undefined, token).code, "operator_credentials_required");
  assert.equal(verifyFleetOperatorBearer("Bearer wrong", token).code, "invalid_operator_credentials");
  assert.equal(verifyFleetOperatorBearer(`Bearer ${token}`, undefined).code, "operator_auth_not_configured");
});
