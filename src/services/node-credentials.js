const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");

function generateNodeCredential() {
  return randomBytes(32).toString("base64url");
}

function hashNodeCredential(credential) {
  return createHash("sha256").update(credential, "utf8").digest();
}

function getBearerCredential(authorization) {
  if (typeof authorization !== "string" || authorization.length === 0) {
    return { error: "credentials_required" };
  }

  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) {
    return { error: "invalid_credentials" };
  }

  return { credential: match[1] };
}

async function authenticateNodeCredential({ nodeId, authorization, pool }) {
  const parsed = getBearerCredential(authorization);
  if (parsed.error) {
    return { authenticated: false, code: parsed.error };
  }

  const result = await pool.query(
    "SELECT token_hash, revoked_at FROM node_credentials WHERE node_id = $1",
    [nodeId],
  );
  const record = result.rows[0];
  if (!record) {
    return { authenticated: false, code: "invalid_credentials" };
  }

  const actualHash = hashNodeCredential(parsed.credential);
  const expectedHash = Buffer.from(record.token_hash);
  const matches = actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);

  if (!matches) {
    return { authenticated: false, code: "invalid_credentials" };
  }
  if (record.revoked_at) {
    return { authenticated: false, code: "credential_revoked" };
  }

  return { authenticated: true, credentialHash: actualHash };
}

module.exports = {
  generateNodeCredential,
  hashNodeCredential,
  getBearerCredential,
  authenticateNodeCredential,
};
