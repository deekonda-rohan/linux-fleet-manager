const { listNodesForPrometheus } = require("../repositories/node-exporter.repository.js");
const { generatePrometheusDiscoveryJson } = require("./prometheus-discovery.js");
const { publishDiscoveryFile } = require("./atomic-discovery-file.js");

function createPrometheusDiscoveryRefresher({
  pool,
  outputPath,
  intervalSeconds,
  logger = console,
  listNodes = listNodesForPrometheus,
  generateJson = generatePrometheusDiscoveryJson,
  publishFile = publishDiscoveryFile,
}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("A PostgreSQL pool is required for discovery refresh");
  }
  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new TypeError("A discovery output path is required");
  }
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 1) {
    throw new TypeError("Discovery refresh interval must be a positive integer");
  }

  let timer;
  let running = false;
  let stopped = false;
  let inFlight;

  async function refreshNow() {
    if (stopped) return false;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        const nodes = await listNodes(pool);
        const json = generateJson(nodes);
        await publishFile(outputPath, json, { overwrite: true });
        const targetCount = JSON.parse(json).reduce((count, group) => count + group.targets.length, 0);
        logger.log(`Prometheus discovery file refreshed (${targetCount} target(s))`);
        return true;
      } catch (error) {
        logger.error("Prometheus discovery refresh failed; keeping the last published file:", error.message);
        return false;
      }
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = undefined;
    }
  }

  function start() {
    if (running || stopped) return inFlight ?? Promise.resolve(false);
    running = true;
    timer = setInterval(() => { void refreshNow(); }, intervalSeconds * 1000);
    timer.unref?.();
    return refreshNow();
  }

  async function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    stopped = true;
    if (inFlight) await inFlight;
  }

  return { start, refreshNow, stop };
}

module.exports = { createPrometheusDiscoveryRefresher };
