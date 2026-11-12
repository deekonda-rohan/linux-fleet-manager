const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Module = require("node:module");
const path = require("node:path");

const dbPath = require.resolve("../src/config/db.js");
const routerPath = require.resolve("../src/routes/node.route.js");
const controllerPath = require.resolve("../src/controllers/node.controller.js");
const remoteControllerPath = require.resolve("../src/controllers/remote-command.controller.js");
const token = "test-only-operator-token-value-long-enough-123456";
const queryCalls = [];
const node = {
  id: "7",
  name: "worker-7",
  hostname: "worker-7.example.test",
  ip_address: "192.0.2.7",
  status: "online",
  last_seen_at: "2026-11-09T10:00:00.000Z",
  created_at: "2026-11-01T10:00:00.000Z",
  exporter_address: "192.0.2.7",
  exporter_port: 9100,
};
const historyRecord = {
  id: "91",
  node_id: "7",
  node_name: "worker-7",
  operation: "uptime",
  status: "succeeded",
  requested_at: "2026-11-09T10:01:00.000Z",
  completed_at: "2026-11-09T10:01:01.000Z",
  exit_code: 0,
  error_code: null,
};

const fakePool = {
  async query(sql, values = []) {
    queryCalls.push({ sql, values });
    if (sql.includes("WITH inserted_node")) {
      return { rows: [{ ...node, id: "8", status: "offline", last_seen_at: null }] };
    }
    if (sql.includes("COUNT(*)::text AS total")) return { rows: [{ total: "3" }] };
    if (sql.includes("FROM remote_command_audit")) return { rows: [historyRecord] };
    if (sql.includes("FROM nodes") && sql.includes("WHERE id = $1")) {
      return { rows: values[0] === "7" ? [node] : [] };
    }
    if (sql.includes("FROM nodes ORDER BY id ASC")) return { rows: [node] };
    throw new Error("Unexpected SQL in operator API test");
  },
};

const originalDbModule = require.cache[dbPath];
const originalOperatorToken = process.env.FLEET_ADMIN_TOKEN;
const originalSshNodes = process.env.FLEET_SSH_NODES;
const fakeDbModule = new Module(dbPath);
fakeDbModule.filename = dbPath;
fakeDbModule.paths = Module._nodeModulePaths(path.dirname(dbPath));
fakeDbModule.loaded = true;
fakeDbModule.exports = { pool: fakePool };
require.cache[dbPath] = fakeDbModule;
delete require.cache[routerPath];
delete require.cache[controllerPath];
delete require.cache[remoteControllerPath];
process.env.FLEET_ADMIN_TOKEN = token;
delete process.env.FLEET_SSH_NODES;

const app = express();
app.use(express.json());
app.use("/api/nodes", require(routerPath));
const server = app.listen(0, "127.0.0.1");
const baseUrl = new Promise((resolve) => {
  server.once("listening", () => resolve(`http://127.0.0.1:${server.address().port}`));
});

function operatorHeaders() {
  return { Authorization: `Bearer ${token}` };
}

test("operator API protects management routes and preserves node authentication boundaries", async (t) => {
  const base = await baseUrl;

  await t.test("authorizes node listing and returns safe node fields", async () => {
    queryCalls.length = 0;
    const response = await fetch(`${base}/api/nodes`, { headers: operatorHeaders() });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.nodes[0].id, "7");
    assert.equal(body.nodes[0].status, "online");
    assert.equal(Object.hasOwn(body.nodes[0], "token_hash"), false);
    assert.equal(queryCalls.length, 1);
  });

  await t.test("rejects unauthorized node listing and registration before database access", async () => {
    queryCalls.length = 0;
    const listResponse = await fetch(`${base}/api/nodes`);
    const detailResponse = await fetch(`${base}/api/nodes/7`);
    const registrationResponse = await fetch(`${base}/api/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "worker", hostname: "worker.test", ip_address: "192.0.2.9" }),
    });
    assert.equal(listResponse.status, 401);
    assert.equal(detailResponse.status, 401);
    assert.equal(registrationResponse.status, 401);
    assert.equal(queryCalls.length, 0);
  });

  await t.test("authorizes registration and issues a one-time node credential", async () => {
    queryCalls.length = 0;
    const response = await fetch(`${base}/api/nodes`, {
      method: "POST",
      headers: { ...operatorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "worker-8", hostname: "worker-8.example.test", ip_address: "192.0.2.8" }),
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.match(body.credential, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(queryCalls.length, 1);
  });

  await t.test("returns authorized node details including availability state", async () => {
    const response = await fetch(`${base}/api/nodes/7`, { headers: operatorHeaders() });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.node.status, "online");
    assert.equal(body.node.last_seen_at, node.last_seen_at);
    assert.equal(Object.hasOwn(body.node, "token_hash"), false);
  });

  await t.test("rejects invalid node IDs and returns 404 for missing nodes", async () => {
    queryCalls.length = 0;
    const invalid = await fetch(`${base}/api/nodes/0`, { headers: operatorHeaders() });
    const missing = await fetch(`${base}/api/nodes/999`, { headers: operatorHeaders() });
    assert.equal(invalid.status, 400);
    assert.equal(missing.status, 404);
    assert.equal(queryCalls.length, 1);
  });

  await t.test("returns filtered, paginated history without private target or credential fields", async () => {
    queryCalls.length = 0;
    const response = await fetch(`${base}/api/nodes/commands/history?node_id=7&limit=1&offset=2`, {
      headers: operatorHeaders(),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.pagination, { limit: 1, offset: 2, total: 3 });
    assert.deepEqual(body.history, [historyRecord]);
    assert.equal(Object.hasOwn(body.history[0], "target_host"), false);
    assert.equal(Object.hasOwn(body.history[0], "output"), false);
    assert.equal(Object.hasOwn(body.history[0], "token_hash"), false);
    assert.deepEqual(queryCalls[0].values, ["7"]);
    assert.deepEqual(queryCalls[1].values, ["7", 1, 2]);
    assert.match(queryCalls[1].sql, /ORDER BY requested_at DESC, id DESC/);
  });

  await t.test("rejects invalid history filters and pagination", async () => {
    queryCalls.length = 0;
    for (const query of ["node_id=-1", "limit=101", "offset=-1", "extra=value"]) {
      const response = await fetch(`${base}/api/nodes/commands/history?${query}`, {
        headers: operatorHeaders(),
      });
      assert.equal(response.status, 400, query);
    }
    assert.equal(queryCalls.length, 0);
  });

  await t.test("rejects unauthorized history and remote diagnostics requests", async () => {
    queryCalls.length = 0;
    const history = await fetch(`${base}/api/nodes/commands/history`);
    const command = await fetch(`${base}/api/nodes/7/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "uptime" }),
    });
    assert.equal(history.status, 401);
    assert.equal(command.status, 401);
    assert.equal(queryCalls.length, 0);
  });

  await t.test("retains node bearer authentication for heartbeats", async () => {
    queryCalls.length = 0;
    const response = await fetch(`${base}/api/nodes/7/heartbeat`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.equal(queryCalls.length, 0);
  });

  await t.test("rejects an unmapped node before creating an audit row or starting SSH", async () => {
    queryCalls.length = 0;
    const response = await fetch(`${base}/api/nodes/7/commands`, {
      method: "POST",
      headers: { ...operatorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "uptime" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).message, "SSH configuration is not available for this node");
    assert.equal(queryCalls.some(({ sql }) => sql.includes("INSERT INTO remote_command_audit")), false);
  });

  await t.test("rejects an arbitrary diagnostic operation before SSH or database access", async () => {
    queryCalls.length = 0;
    const response = await fetch(`${base}/api/nodes/7/commands`, {
      method: "POST",
      headers: { ...operatorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "cat /etc/shadow" }),
    });
    assert.equal(response.status, 400);
    assert.equal(queryCalls.length, 0);
  });

  await t.test("rejects invalid per-node SSH configuration safely", async () => {
    process.env.FLEET_SSH_NODES = "not-json";
    const response = await fetch(`${base}/api/nodes/7/commands`, {
      method: "POST",
      headers: { ...operatorHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "uptime" }),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).message, "FLEET_SSH_NODES must contain valid JSON");
    if (originalSshNodes === undefined) delete process.env.FLEET_SSH_NODES;
    else process.env.FLEET_SSH_NODES = originalSshNodes;
  });
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const modulePath of [routerPath, controllerPath, remoteControllerPath]) {
    delete require.cache[modulePath];
  }
  if (originalDbModule) require.cache[dbPath] = originalDbModule;
  else delete require.cache[dbPath];
  if (originalOperatorToken === undefined) delete process.env.FLEET_ADMIN_TOKEN;
  else process.env.FLEET_ADMIN_TOKEN = originalOperatorToken;
  if (originalSshNodes === undefined) delete process.env.FLEET_SSH_NODES;
  else process.env.FLEET_SSH_NODES = originalSshNodes;
});
