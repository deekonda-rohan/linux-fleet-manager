const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_REFRESH_SECONDS,
  loadPrometheusDiscoveryConfig,
  parseRefreshSeconds,
} = require("../src/config/prometheus-discovery.js");

test("discovery output is disabled unless an explicit path is configured", () => {
  assert.deepEqual(loadPrometheusDiscoveryConfig({}), {
    outputPath: null,
    refreshSeconds: DEFAULT_REFRESH_SECONDS,
  });
});

test("accepts a configured JSON output path and refresh interval", () => {
  const config = loadPrometheusDiscoveryConfig({
    PROMETHEUS_DISCOVERY_FILE: "C:/prometheus-file-sd/fleet-nodes.json",
    PROMETHEUS_DISCOVERY_REFRESH_SECONDS: "20",
  });
  assert.match(config.outputPath, /fleet-nodes\.json$/);
  assert.equal(config.refreshSeconds, 20);
});

test("rejects protected output paths and invalid refresh intervals", () => {
  assert.throws(() => loadPrometheusDiscoveryConfig({ PROMETHEUS_DISCOVERY_FILE: "nodes.json" }), /protected/);
  for (const value of ["0", "-1", "abc", "1.5", "3601"]) {
    assert.throws(() => parseRefreshSeconds(value), /integer from 1 to 3600/);
  }
});
