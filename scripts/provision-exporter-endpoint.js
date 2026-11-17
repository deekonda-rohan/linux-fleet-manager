require("dotenv").config();

const { pool } = require("../src/config/db.js");
const {
  provisionExporterEndpoint,
} = require("../src/services/exporter-endpoint.js");

async function main() {
  const [, , nodeId, address, port, ...extra] = process.argv;
  if (!nodeId || !address || !port || extra.length > 0) {
    console.error(
      "Usage: node scripts/provision-exporter-endpoint.js <node-id> <exporter-address> <exporter-port>",
    );
    process.exitCode = 2;
    return;
  }

  const result = await provisionExporterEndpoint(pool, nodeId, address, port);
  if (result.error) {
    console.error(result.error);
    process.exitCode = result.notFound ? 1 : 2;
    return;
  }

  console.log(`Exporter endpoint configured for node ${result.value.id}`);
}

main()
  .catch((error) => {
    console.error("Exporter endpoint provisioning failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (error) {
      console.error("Failed to close PostgreSQL pool:", error.message);
      process.exitCode = 1;
    }
  });
