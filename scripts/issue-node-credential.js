require("dotenv").config();

const { pool } = require("../src/config/db.js");
const {
  generateNodeCredential,
  hashNodeCredential,
} = require("../src/services/node-credentials.js");

async function main() {
  const [, , nodeId, option] = process.argv;
  if (
    !nodeId ||
    !/^[1-9]\d*$/.test(nodeId) ||
    (option && option !== "--rotate")
  ) {
    console.error(
      "Usage: node scripts/issue-node-credential.js <node-id> [--rotate]",
    );
    process.exitCode = 2;
    return;
  }

  const credential = generateNodeCredential();
  const credentialHash = hashNodeCredential(credential);
  const query =
    option === "--rotate"
      ? `INSERT INTO node_credentials (node_id, token_hash)
       SELECT id, $2 FROM nodes WHERE id = $1
       ON CONFLICT (node_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash, created_at = NOW(), revoked_at = NULL
       RETURNING node_id`
      : `INSERT INTO node_credentials (node_id, token_hash)
       SELECT id, $2 FROM nodes WHERE id = $1
       ON CONFLICT (node_id) DO NOTHING
       RETURNING node_id`;

  try {
    const result = await pool.query(query, [nodeId, credentialHash]);
    if (result.rowCount === 0) {
      const existingNode = await pool.query(
        "SELECT 1 FROM nodes WHERE id = $1",
        [nodeId],
      );
      console.error(
        existingNode.rowCount === 0
          ? "Node not found; no credential was issued"
          : "Node already has a credential; use --rotate to replace it",
      );
      process.exitCode = 1;
      return;
    }

    process.stdout.write(`${credential}\n`);
  } catch (error) {
    console.error("Credential provisioning failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error("Credential provisioning failed:", error.message);
  process.exitCode = 1;
  await pool.end();
});
