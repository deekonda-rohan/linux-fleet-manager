const test = require("node:test");
const assert = require("node:assert/strict");
const { createShutdownHandler } = require("../src/services/shutdown.js");

test("shutdown is idempotent and closes checker, HTTP server, and pool once", async () => {
  const order = [];
  const server = {
    listening: true,
    close(callback) {
      order.push("server");
      this.listening = false;
      callback();
    },
  };
  const pool = { async end() { order.push("pool"); } };
  const shutdown = createShutdownHandler({
    server,
    pool,
    async stopAvailabilityChecker() { order.push("checker"); },
    logger: { log() {}, error() {} },
  });

  const first = shutdown("SIGTERM");
  const second = shutdown("SIGINT");
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.deepEqual(order, ["checker", "server", "pool"]);
});

test("shutdown still closes the pool and reports failure if server close fails", async () => {
  let poolClosed = false;
  let failureReported = false;
  const shutdown = createShutdownHandler({
    server: {
      listening: true,
      close(callback) { callback(new Error("close failed")); },
    },
    pool: { async end() { poolClosed = true; } },
    async stopAvailabilityChecker() {},
    logger: { log() {}, error() {} },
    onFailure() { failureReported = true; },
  });

  await shutdown("SIGINT");
  assert.equal(poolClosed, true);
  assert.equal(failureReported, true);
});
