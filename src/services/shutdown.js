function createShutdownHandler({
  server,
  pool,
  stopAvailabilityChecker,
  stopPrometheusDiscovery = async () => {},
  logger = console,
  onFailure = () => {
    process.exitCode = 1;
  },
}) {
  let shutdownPromise;

  return function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      let failed = false;
      logger.log(`Received ${signal}; starting graceful shutdown`);

      try {
        await stopAvailabilityChecker();
        logger.log("Availability checker stopped");
      } catch (error) {
        failed = true;
        logger.error("Failed to stop availability checker:", error.message);
      }

      try {
        await stopPrometheusDiscovery();
        logger.log("Prometheus discovery refresher stopped");
      } catch (error) {
        failed = true;
        logger.error(
          "Failed to stop Prometheus discovery refresher:",
          error.message,
        );
      }

      if (server?.listening) {
        try {
          await new Promise((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
          logger.log("HTTP server closed");
        } catch (error) {
          failed = true;
          logger.error("Failed to close HTTP server:", error.message);
        }
      }

      try {
        await pool.end();
        logger.log("PostgreSQL pool closed");
      } catch (error) {
        failed = true;
        logger.error("Failed to close PostgreSQL pool:", error.message);
      }

      if (failed) {
        onFailure();
      } else {
        logger.log("Graceful shutdown complete");
      }
    })();

    return shutdownPromise;
  };
}

module.exports = { createShutdownHandler };
