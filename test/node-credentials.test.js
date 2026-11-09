const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generateNodeCredential,
  hashNodeCredential,
  authenticateNodeCredential,
} = require("../src/services/node-credentials.js");

function credentialPoolFor(nodeId, credential, revokedAt = null) {
  const record = credential
    ? { token_hash: hashNodeCredential(credential), revoked_at: revokedAt }
    : null;
  return {
    async query(_sql, values) {
      return { rows: values[0] === nodeId && record ? [record] : [] };
    },
  };
}

test("generates independent 256-bit base64url credentials", () => {
  const first = generateNodeCredential();
  const second = generateNodeCredential();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(hashNodeCredential(first).length, 32);
});

test("authenticates a matching, active node credential", async () => {
  const credential = generateNodeCredential();
  const result = await authenticateNodeCredential({
    nodeId: "42",
    authorization: `Bearer ${credential}`,
    pool: credentialPoolFor("42", credential),
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.credentialHash.equals(hashNodeCredential(credential)), true);
});

test("rejects missing and malformed credentials", async () => {
  const pool = credentialPoolFor("42", generateNodeCredential());
  assert.deepEqual(await authenticateNodeCredential({ nodeId: "42", pool }), {
    authenticated: false,
    code: "credentials_required",
  });
  assert.deepEqual(await authenticateNodeCredential({
    nodeId: "42",
    authorization: "Bearer malformed",
    pool,
  }), { authenticated: false, code: "invalid_credentials" });
});

test("rejects invalid credentials", async () => {
  const expected = generateNodeCredential();
  const result = await authenticateNodeCredential({
    nodeId: "42",
    authorization: `Bearer ${generateNodeCredential()}`,
    pool: credentialPoolFor("42", expected),
  });
  assert.deepEqual(result, { authenticated: false, code: "invalid_credentials" });
});

test("a node credential cannot authenticate as another node", async () => {
  const credential = generateNodeCredential();
  const result = await authenticateNodeCredential({
    nodeId: "43",
    authorization: `Bearer ${credential}`,
    pool: credentialPoolFor("42", credential),
  });
  assert.deepEqual(result, { authenticated: false, code: "invalid_credentials" });
});

test("rejects a credential after revocation", async () => {
  const credential = generateNodeCredential();
  const result = await authenticateNodeCredential({
    nodeId: "42",
    authorization: `Bearer ${credential}`,
    pool: credentialPoolFor("42", credential, new Date()),
  });
  assert.deepEqual(result, { authenticated: false, code: "credential_revoked" });
});
