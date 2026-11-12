const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrometheusDiscoveryRefresher } = require("../src/services/prometheus-discovery-refresh.js");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("refreshes immediately from PostgreSQL and publishes configured offline nodes", async () => {
  const calls = [];
  const refresher = createPrometheusDiscoveryRefresher({
    pool: { async query() {} },
    outputPath: "C:/prometheus-file-sd/fleet-nodes.json",
    intervalSeconds: 60,
    listNodes: async () => [{ node_id: "8", node_name: "offline-node", status: "offline", exporter_address: "host-8", exporter_port: 9100 }],
    publishFile: async (...args) => calls.push(args),
    logger: { log() {}, error() {} },
  });

  assert.equal(await refresher.start(), true);
  await refresher.stop();
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1]), [{
    targets: ["host-8:9100"],
    labels: { node_id: "8", node_name: "offline-node" },
  }]);
  assert.deepEqual(calls[0][2], { overwrite: true });
});

test("coalesces overlapping refreshes and waits for in-flight publication on stop", async () => {
  const gate = deferred();
  let listCount = 0;
  const refresher = createPrometheusDiscoveryRefresher({
    pool: { async query() {} },
    outputPath: "C:/prometheus-file-sd/fleet-nodes.json",
    intervalSeconds: 60,
    async listNodes() { listCount += 1; await gate.promise; return []; },
    publishFile: async () => {},
    logger: { log() {}, error() {} },
  });

  const first = refresher.start();
  const overlapping = refresher.refreshNow();
  let stopped = false;
  const stop = refresher.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(listCount, 1);
  assert.equal(stopped, false);
  gate.resolve();
  assert.equal(await first, true);
  assert.equal(await overlapping, true);
  await stop;
  assert.equal(stopped, true);
  assert.equal(await refresher.refreshNow(), false);
});

test("retains the last published file when generation fails", async () => {
  const messages = [];
  const refresher = createPrometheusDiscoveryRefresher({
    pool: { async query() {} },
    outputPath: "C:/prometheus-file-sd/fleet-nodes.json",
    intervalSeconds: 60,
    async listNodes() { return [{}]; },
    generateJson() { throw new Error("invalid configured endpoint"); },
    publishFile: async () => { throw new Error("must not publish"); },
    logger: { log() {}, error(...args) { messages.push(args); } },
  });

  assert.equal(await refresher.start(), false);
  await refresher.stop();
  assert.equal(messages.length, 1);
});
