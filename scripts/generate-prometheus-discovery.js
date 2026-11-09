require("dotenv").config();

const { pool } = require("../src/config/db.js");
const { listNodesForPrometheus } = require("../src/repositories/node-exporter.repository.js");
const { generatePrometheusDiscoveryJson } = require("../src/services/prometheus-discovery.js");
const { publishDiscoveryFile, validateOutputPath } = require("../src/services/atomic-discovery-file.js");

async function main() {
  const [, , outputPath, ...options] = process.argv;
  const overwrite = options.length === 1 && options[0] === "--overwrite";
  if (!outputPath || (options.length > 0 && !overwrite)) {
    console.error("Usage: node scripts/generate-prometheus-discovery.js <output-path.json> [--overwrite]");
    process.exitCode = 2;
    return;
  }

  const safeOutputPath = validateOutputPath(outputPath);
  const nodes = await listNodesForPrometheus(pool);
  const json = generatePrometheusDiscoveryJson(nodes);
  await publishDiscoveryFile(safeOutputPath, json, { overwrite });
  console.log(`Prometheus discovery file generated with ${JSON.parse(json).length} configured target(s)`);
}

main().catch((error) => {
  console.error("Prometheus discovery generation failed:", error.message);
  process.exitCode = 1;
}).finally(async () => {
  try {
    await pool.end();
  } catch (error) {
    console.error("Failed to close PostgreSQL pool:", error.message);
    process.exitCode = 1;
  }
});
