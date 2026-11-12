const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const {
  APPROVED_OPERATIONS,
  buildSshArguments,
  isValidSshHost,
  isValidSshKeyPath,
  runApprovedRemoteOperation,
} = require("../src/services/remote-operations.js");

test("the remote operation catalog contains only fixed diagnostic commands", () => {
  assert.deepEqual(Object.keys(APPROVED_OPERATIONS), [
    "uptime", "disk_usage", "memory_usage", "kernel_info",
    "disk_usage_all", "memory_usage_mb", "node_exporter_status",
  ]);
  assert.equal(Object.values(APPROVED_OPERATIONS).some((command) => command.includes("$")), false);
  assert.equal(APPROVED_OPERATIONS.disk_usage_all, "df -h");
  assert.equal(APPROVED_OPERATIONS.memory_usage_mb, "free -m");
  assert.equal(
    APPROVED_OPERATIONS.node_exporter_status,
    "systemctl status node_exporter.service --no-pager",
  );
});

test("SSH timeout configuration uses the safe default and rejects invalid or excessive values", () => {
  const { DEFAULT_SSH_TIMEOUT_MS, parseSshTimeoutMs } = require("../src/config/ssh.js");
  assert.equal(parseSshTimeoutMs(undefined), DEFAULT_SSH_TIMEOUT_MS);
  assert.equal(parseSshTimeoutMs("1"), 1);
  assert.equal(parseSshTimeoutMs("10000"), 10000);
  for (const invalid of ["0", "-1", "1.5", "abc", "120001"]) {
    assert.throws(() => parseSshTimeoutMs(invalid), /FLEET_SSH_TIMEOUT_MS/);
  }
});

test("per-node SSH configuration maps each node to its own validated identity", () => {
  const { parseNodeSshConfig, getNodeSshConfig } = require("../src/config/ssh.js");
  const raw = JSON.stringify({
    "5": { sshUser: "fleetdiag", sshKeyPath: "C:\\test-keys\\node-5.pem" },
    "6": { sshUser: "fleetdiag", sshKeyPath: "C:\\test-keys\\node-6.pem" },
  });
  const parsed = parseNodeSshConfig(raw);
  assert.equal(parsed.error, null);
  assert.deepEqual(getNodeSshConfig("5", raw).config, {
    sshUser: "fleetdiag", sshKeyPath: "C:\\test-keys\\node-5.pem",
  });
  assert.deepEqual(getNodeSshConfig("6", raw).config, {
    sshUser: "fleetdiag", sshKeyPath: "C:\\test-keys\\node-6.pem",
  });
  assert.equal(getNodeSshConfig("7", raw).error, "SSH configuration is not available for this node");
  const args5 = buildSshArguments({ host: "10.170.237.204", ...getNodeSshConfig("5", raw).config, operation: "uptime" });
  const args6 = buildSshArguments({ host: "10.170.237.136", ...getNodeSshConfig("6", raw).config, operation: "uptime" });
  assert.ok(args5.includes("IdentityFile=C:\\test-keys\\node-5.pem"));
  assert.ok(args6.includes("IdentityFile=C:\\test-keys\\node-6.pem"));
});

test("per-node SSH configuration rejects malformed JSON and invalid entries", () => {
  const { parseNodeSshConfig } = require("../src/config/ssh.js");
  for (const invalid of [
    "{",
    "[]",
    JSON.stringify({ "0": { sshUser: "fleetdiag", sshKeyPath: "D:\\key.pem" } }),
    JSON.stringify({ "5": { sshUser: "fleetdiag;id", sshKeyPath: "D:\\key.pem" } }),
    JSON.stringify({ "5": { sshUser: "fleetdiag", sshKeyPath: "relative.pem" } }),
    JSON.stringify({ "5": { sshUser: "fleetdiag", sshKeyPath: "D:\\key.pem", extra: true } }),
  ]) {
    assert.ok(parseNodeSshConfig(invalid).error);
  }
  assert.equal(parseNodeSshConfig(undefined).error, null);
});

test("SSH arguments reject unapproved operations and unsafe hosts/users", () => {
  const validKey = "C:\\fleet\\ssh\\fleet-manager-ed25519";
  assert.throws(() => buildSshArguments({ host: "node-1", sshUser: "fleet", sshKeyPath: validKey, operation: "rm -rf /" }), /not approved/);
  assert.throws(() => buildSshArguments({ host: "-oProxyCommand=evil", sshUser: "fleet", sshKeyPath: validKey, operation: "uptime" }), /invalid SSH host/);
  assert.throws(() => buildSshArguments({ host: "node-1", sshUser: "fleet;id", sshKeyPath: validKey, operation: "uptime" }), /SSH user/);
  assert.equal(isValidSshHost("2001:db8::1"), true);
  assert.equal(isValidSshKeyPath(validKey), true);
  assert.equal(isValidSshKeyPath("relative/key"), false);
});

test("executes an approved command without a local shell", async () => {
  let invocation;
  const result = await runApprovedRemoteOperation({
    host: "192.0.2.8",
    sshUser: "fleet",
    sshKeyPath: "C:\\fleet\\ssh\\fleet-manager-ed25519",
    operation: "uptime",
    spawnImpl(command, args, options) {
      invocation = { command, args, options };
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => true;
      setImmediate(() => {
        child.stdout.write("up 3 days\n");
        child.stdout.end();
        child.emit("close", 0, null);
      });
      return child;
    },
  });

  assert.equal(invocation.command, "ssh");
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.args.includes("IdentitiesOnly=yes"), true);
  assert.equal(invocation.args.includes("IdentityFile=C:\\fleet\\ssh\\fleet-manager-ed25519"), true);
  assert.equal(invocation.args.includes("StrictHostKeyChecking=yes"), true);
  assert.equal(invocation.args.includes("BatchMode=yes"), true);
  assert.equal(invocation.args.includes("PasswordAuthentication=no"), true);
  assert.equal(invocation.args.at(-1), "uptime");
  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "up 3 days\n");
});

test("times out and terminates a hung SSH process", async () => {
  let killed = false;
  const result = await runApprovedRemoteOperation({
    host: "node-1.example.test",
    sshUser: "fleet",
    sshKeyPath: "C:\\fleet\\ssh\\fleet-manager-ed25519",
    operation: "kernel_info",
    timeoutMs: 5,
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        killed = true;
        setImmediate(() => child.emit("close", null, "SIGTERM"));
        return true;
      };
      return child;
    },
  });
  assert.equal(killed, true);
  assert.equal(result.status, "timed_out");
  assert.equal(result.errorCode, "timeout");
});

test("caps command output and terminates a process that exceeds the limit", async () => {
  const result = await runApprovedRemoteOperation({
    host: "node-1.example.test",
    sshUser: "fleet",
    sshKeyPath: "C:\\fleet\\ssh\\fleet-manager-ed25519",
    operation: "memory_usage",
    maxOutputBytes: 4,
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        setImmediate(() => child.emit("close", null, "SIGTERM"));
        return true;
      };
      setImmediate(() => child.stdout.write("123456789"));
      return child;
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "output_limit");
  assert.equal(Buffer.byteLength(result.output), 4);
});

test("captures stdout and stderr under one combined output limit", async () => {
  let killed = false;
  const result = await runApprovedRemoteOperation({
    host: "node-1.example.test",
    sshUser: "fleet",
    sshKeyPath: "C:\\fleet\\ssh\\fleet-manager-ed25519",
    operation: "uptime",
    maxOutputBytes: 5,
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => { killed = true; setImmediate(() => child.emit("close", null, "SIGTERM")); };
      setImmediate(() => {
        child.stdout.write("out");
        child.stderr.write("err");
      });
      return child;
    },
  });
  assert.equal(killed, true);
  assert.equal(result.status, "failed");
  assert.equal(result.errorCode, "output_limit");
  assert.equal(result.output, "out");
  assert.equal(result.stderr, "er");
  assert.equal(Buffer.byteLength(result.output) + Buffer.byteLength(result.stderr), 5);
});
