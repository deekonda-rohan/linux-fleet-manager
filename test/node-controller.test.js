const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { hashNodeCredential } = require("../src/services/node-credentials.js");

const dbPath = require.resolve("../src/config/db.js");
const controllerPath = require.resolve("../src/controllers/node.controller.js");
let queryCalls = [];
let nextResult;
const fakePool = {
  async query(sql, values) {
    queryCalls.push({ sql, values });
    return nextResult;
  },
};
const originalDbModule = require.cache[dbPath];
const fakeDbModule = new Module(dbPath);
fakeDbModule.filename = dbPath;
fakeDbModule.loaded = true;
fakeDbModule.exports = { pool: fakePool };
require.cache[dbPath] = fakeDbModule;
delete require.cache[controllerPath];
const controller = require(controllerPath);

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("registers validated nodes and returns a one-time credential with only its hash stored", async () => {
  queryCalls = [];
  nextResult = { rows: [{ id: "15", name: "worker-15", hostname: "worker-15.test", ip_address: "192.0.2.15" }] };
  const res = responseRecorder();
  await controller.registerNode({ body: {
    name: "worker-15", hostname: "worker-15.test", ip_address: "192.0.2.15",
  } }, res);

  assert.equal(res.statusCode, 201);
  assert.match(res.body.credential, /^[A-Za-z0-9_-]{43}$/);
  assert.match(queryCalls[0].sql, /INSERT INTO node_credentials/);
  assert.equal(Buffer.isBuffer(queryCalls[0].values[3]), true);
  assert.deepEqual(queryCalls[0].values[3], hashNodeCredential(res.body.credential));
  assert.equal(JSON.stringify(res.body.node).includes("token_hash"), false);
});

test("rejects invalid registration before database writes", async () => {
  queryCalls = [];
  const res = responseRecorder();
  await controller.registerNode({ body: { name: "bad" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queryCalls.length, 0);
});

test("credential rotation and revocation handlers are callable", async () => {
  queryCalls = [];
  nextResult = { rows: [{ node_id: "15" }], rowCount: 1 };
  const rotateRes = responseRecorder();
  await controller.rotateNodeCredential({ params: { id: "15" }, nodeCredentialHash: Buffer.alloc(32) }, rotateRes);
  assert.equal(rotateRes.statusCode, 200);
  assert.match(rotateRes.body.credential, /^[A-Za-z0-9_-]{43}$/);

  const revokeRes = responseRecorder();
  await controller.revokeNodeCredential({ params: { id: "15" }, nodeCredentialHash: Buffer.alloc(32) }, revokeRes);
  assert.equal(revokeRes.statusCode, 200);
});

test.after(() => {
  delete require.cache[controllerPath];
  if (originalDbModule) require.cache[dbPath] = originalDbModule;
  else delete require.cache[dbPath];
});
