const test = require("node:test");
const assert = require("node:assert/strict");
const {
  recordNodeHeartbeat,
  markExpiredNodesOffline,
  createAvailabilityChecker,
} = require("../src/services/node-availability.js");
const { authenticateNodeCredential, generateNodeCredential, hashNodeCredential } = require("../src/services/node-credentials.js");

const fixedNow = new Date("2026-11-07T10:00:00.000Z");

function createPool(nodes) {
  const state = nodes.map((node) => ({ ...node }));
  let statusWrites = 0;

  return {
    state,
    get statusWrites() { return statusWrites; },
    async query(sql, values) {
      if (sql.includes("SET status = 'online'")) {
        const node = state.find((candidate) => String(candidate.id) === String(values[0]));
        if (!node) return { rowCount: 0, rows: [] };
        node.status = "online";
        node.last_seen_at = new Date(fixedNow);
        statusWrites += 1;
        return { rowCount: 1, rows: [{ id: node.id }] };
      }

      if (sql.includes("WITH cutoff AS")) {
        const cutoff = fixedNow.getTime() - values[0] * 1000;
        const changed = [];
        for (const node of state) {
          if (node.status !== "online" || node.last_seen_at == null) continue;
          if (new Date(node.last_seen_at).getTime() < cutoff) {
            node.status = "offline";
            changed.push({ id: node.id, name: node.name });
            statusWrites += 1;
          }
        }
        return { rowCount: changed.length, rows: changed };
      }

      throw new Error("Unexpected SQL in availability test pool");
    },
  };
}

function seenAgo(milliseconds) {
  return new Date(fixedNow.getTime() - milliseconds);
}

test("valid heartbeat updates last_seen_at and recovers an offline node", async () => {
  const pool = createPool([{ id: "1", status: "offline", last_seen_at: seenAgo(60000) }]);
  assert.equal(await recordNodeHeartbeat(pool, "1"), true);
  assert.equal(pool.state[0].status, "online");
  assert.deepEqual(pool.state[0].last_seen_at, fixedNow);
});

test("a node older than the timeout becomes offline", async () => {
  const pool = createPool([{ id: "1", name: "worker-1", status: "online", last_seen_at: seenAgo(30001) }]);
  const result = await markExpiredNodesOffline(pool, 30);
  assert.equal(pool.state[0].status, "offline");
  assert.deepEqual(result.rows.map((node) => node.id), ["1"]);
});

test("a node remains online before the timeout", async () => {
  const pool = createPool([{ id: "1", status: "online", last_seen_at: seenAgo(29999) }]);
  await markExpiredNodesOffline(pool, 30);
  assert.equal(pool.state[0].status, "online");
});

test("a node exactly at the timeout boundary remains online", async () => {
  const pool = createPool([{ id: "1", status: "online", last_seen_at: seenAgo(30000) }]);
  await markExpiredNodesOffline(pool, 30);
  assert.equal(pool.state[0].status, "online");
});

test("availability is evaluated independently across nodes", async () => {
  const pool = createPool([
    { id: "1", name: "stale", status: "online", last_seen_at: seenAgo(31000) },
    { id: "2", name: "fresh", status: "online", last_seen_at: seenAgo(1000) },
  ]);
  await markExpiredNodesOffline(pool, 30);
  assert.deepEqual(pool.state.map((node) => node.status), ["offline", "online"]);
});

test("already-offline nodes and null heartbeat timestamps are not updated", async () => {
  const pool = createPool([
    { id: "1", status: "offline", last_seen_at: seenAgo(90000) },
    { id: "2", status: "online", last_seen_at: null },
  ]);
  await markExpiredNodesOffline(pool, 30);
  assert.equal(pool.statusWrites, 0);
  assert.deepEqual(pool.state.map((node) => node.status), ["offline", "online"]);
});

test("invalid heartbeat credentials leave node state unchanged", async () => {
  const validCredential = generateNodeCredential();
  const pool = createPool([{ id: "1", status: "offline", last_seen_at: null }]);
  let heartbeatWrites = 0;
  const query = pool.query.bind(pool);
  pool.query = async (sql, values) => {
    if (sql.includes("SELECT token_hash")) {
      return { rows: [{ token_hash: hashNodeCredential(validCredential), revoked_at: null }] };
    }
    if (sql.includes("SET status = 'online'")) heartbeatWrites += 1;
    return query(sql, values);
  };

  const auth = await authenticateNodeCredential({
    nodeId: "1",
    authorization: `Bearer ${generateNodeCredential()}`,
    pool,
  });
  assert.deepEqual(auth, { authenticated: false, code: "invalid_credentials" });
  assert.equal(heartbeatWrites, 0);
  assert.equal(pool.state[0].status, "offline");
  assert.equal(pool.state[0].last_seen_at, null);
});

test("availability checker stops its timer and does not overlap checks", async () => {
  const callbacks = [];
  const cancelled = [];
  const pool = createPool([]);
  const checker = createAvailabilityChecker({
    pool,
    timeoutSeconds: 30,
    intervalSeconds: 10,
    logger: { log() {}, error() {} },
    schedule(callback, delay) {
      const handle = { callback, delay };
      callbacks.push(handle);
      return handle;
    },
    cancel(handle) { cancelled.push(handle); },
  });

  checker.start();
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].delay, 10000);
  await callbacks[0].callback();
  assert.equal(callbacks.length, 2);
  await checker.stop();
  assert.deepEqual(cancelled, [callbacks[1]]);
});
