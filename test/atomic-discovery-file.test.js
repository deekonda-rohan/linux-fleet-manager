const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { publishDiscoveryFile, validateOutputPath } = require("../src/services/atomic-discovery-file.js");

async function makeTestDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), "fleet-discovery-test-"));
}

async function listTemporaryFiles(directory) {
  return (await fs.readdir(directory)).filter((name) => name.endsWith(".tmp"));
}

test("publishes a new discovery file and leaves no temporary file", async (t) => {
  const directory = await makeTestDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "fleet-manager-nodes.json");
  await publishDiscoveryFile(output, "[]\n");
  assert.equal(await fs.readFile(output, "utf8"), "[]\n");
  assert.deepEqual(await listTemporaryFiles(directory), []);
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith(".lock")), []);
});

test("refuses to replace an existing file unless overwrite is explicit", async (t) => {
  const directory = await makeTestDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "fleet-manager-nodes.json");
  await fs.writeFile(output, "old-content\n");
  await assert.rejects(publishDiscoveryFile(output, "new-content\n"), /already exists/);
  assert.equal(await fs.readFile(output, "utf8"), "old-content\n");
});

test("atomically replaces an existing discovery file when requested", async (t) => {
  const directory = await makeTestDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "fleet-manager-nodes.json");
  await fs.writeFile(output, "old-content\n");
  await publishDiscoveryFile(output, "new-content\n", { overwrite: true });
  assert.equal(await fs.readFile(output, "utf8"), "new-content\n");
  assert.deepEqual(await listTemporaryFiles(directory), []);
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith(".lock")), []);
});

test("cleans up its temporary file when publication fails", async (t) => {
  const directory = await makeTestDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "fleet-manager-nodes.json");
  await fs.mkdir(output);
  await assert.rejects(publishDiscoveryFile(output, "[]\n", { overwrite: true }));
  assert.deepEqual(await listTemporaryFiles(directory), []);
  assert.deepEqual((await fs.readdir(directory)).filter((name) => name.endsWith(".lock")), []);
});

test("does not remove another publisher's lock", async (t) => {
  const directory = await makeTestDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "fleet-manager-nodes.json");
  const lock = `${output}.lock`;
  await fs.writeFile(lock, "active publisher");
  await assert.rejects(publishDiscoveryFile(output, "[]\n"), /publication is in progress/);
  assert.equal(await fs.readFile(lock, "utf8"), "active publisher");
  assert.deepEqual(await listTemporaryFiles(directory), []);
});

test("refuses protected nodes.json and non-JSON output paths", () => {
  assert.throws(() => validateOutputPath("C:\\prometheus\\file_sd\\nodes.json"), /protected nodes.json/);
  assert.throws(() => validateOutputPath("C:\\prometheus\\prometheus.yml"), /end in .json/);
});
