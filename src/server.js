require("dotenv").config();
const app = require("./app.js");
const {
  pool,
  testDatabaseConnection,
  initializeDatabase,
} = require("./config/db.js");
const {
  HEARTBEAT_TIMEOUT_SECONDS,
  OFFLINE_CHECK_INTERVAL_SECONDS,
} = require("./config/availability.js");
const { createAvailabilityChecker } = require("./services/node-availability.js");
const { createShutdownHandler } = require("./services/shutdown.js");
const { createPrometheusDiscoveryRefresher } = require("./services/prometheus-discovery-refresh.js");
const { loadPrometheusDiscoveryConfig } = require("./config/prometheus-discovery.js");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    const discoveryConfig = loadPrometheusDiscoveryConfig();
    await testDatabaseConnection();
    await initializeDatabase();

    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(PORT, "0.0.0.0");
      listener.once("listening", () => resolve(listener));
      listener.once("error", reject);
    });
    console.log(`Fleet Manager running on port ${PORT}`);

    const availabilityChecker = createAvailabilityChecker({
      pool,
      timeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
      intervalSeconds: OFFLINE_CHECK_INTERVAL_SECONDS,
    });
    availabilityChecker.start();

    const discoveryRefresher = discoveryConfig.outputPath
      ? createPrometheusDiscoveryRefresher({
        pool,
        outputPath: discoveryConfig.outputPath,
        intervalSeconds: discoveryConfig.refreshSeconds,
      })
      : null;
    const shutdown = createShutdownHandler({
      server,
      pool,
      stopAvailabilityChecker: () => availabilityChecker.stop(),
      stopPrometheusDiscovery: () => discoveryRefresher?.stop(),
    });
    process.once("SIGINT", () => { void shutdown("SIGINT"); });
    process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
    if (discoveryRefresher) void discoveryRefresher.start();
  } catch (error) {
    console.error("Failed to start Fleet Manager:", error.message);
    try {
      await pool.end();
    } catch (closeError) {
      console.error("Failed to close PostgreSQL pool after startup error:", closeError.message);
    }
    process.exitCode = 1;
  }
}

startServer();
