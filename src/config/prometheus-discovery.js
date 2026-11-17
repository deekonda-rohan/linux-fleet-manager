const { validateOutputPath } = require("../services/atomic-discovery-file.js");

const DEFAULT_REFRESH_SECONDS = 15;
const MAX_REFRESH_SECONDS = 3600;

function parseRefreshSeconds(value) {
  if (value === undefined) return DEFAULT_REFRESH_SECONDS;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(
      "PROMETHEUS_DISCOVERY_REFRESH_SECONDS must be an integer from 1 to 3600",
    );
  }
  const seconds = Number(value);
  if (
    !Number.isSafeInteger(seconds) ||
    seconds < 1 ||
    seconds > MAX_REFRESH_SECONDS
  ) {
    throw new Error(
      "PROMETHEUS_DISCOVERY_REFRESH_SECONDS must be an integer from 1 to 3600",
    );
  }
  return seconds;
}

function loadPrometheusDiscoveryConfig(env = process.env) {
  const configuredPath = env.PROMETHEUS_DISCOVERY_FILE;
  const refreshSeconds = parseRefreshSeconds(
    env.PROMETHEUS_DISCOVERY_REFRESH_SECONDS,
  );
  if (configuredPath === undefined || configuredPath === "") {
    return { outputPath: null, refreshSeconds };
  }
  if (typeof configuredPath !== "string") {
    throw new Error("PROMETHEUS_DISCOVERY_FILE must be a JSON output path");
  }
  if (configuredPath.trim() === "") return { outputPath: null, refreshSeconds };
  return {
    outputPath: validateOutputPath(configuredPath),
    refreshSeconds,
  };
}

module.exports = {
  DEFAULT_REFRESH_SECONDS,
  MAX_REFRESH_SECONDS,
  parseRefreshSeconds,
  loadPrometheusDiscoveryConfig,
};
