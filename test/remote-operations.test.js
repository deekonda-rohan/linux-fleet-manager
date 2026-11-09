const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const {
  APPROVED_OPERATIONS,
  buildSshArguments,
  isValidSshHost,
  runApprovedRemoteOperation,
} = require("../src/services/remote-operations.js");

test("the remote operation catalog contains only fixed diagnostic commands", () => {
  assert.deepEqual(Object.keys(APPROVED_OPERATIONS), ["uptime", "disk_usage", "memory_usage", "kernel_info"]);
  assert.equal(Object.values(APPROVED_OPERATIONS).some((command) => command.includes("$")), false);
});

test("SSH arguments reject unapproved operations and unsafe hosts/users", () => {
  assert.throws(() => buildSshArguments({ host: "node-1", sshUser: "fleet", operation: "rm -rf /" }), /not approved/);
  assert.throws(() => buildSshArguments({ host: "-oProxyCommand=evil", sshUser: "fleet", operation: "uptime" }), /invalid SSH host/);
  assert.throws(() => buildSshArguments({ host: "node-1", sshUser: "fleet;id", operation: "uptime" }), /SSH user/);
  assert.equal(isValidSshHost("2001:db8::1"), true);
});

test("executes an approved command without a local shell", async () => {
  let invocation;
  const result = await runApprovedRemoteOperation({
    host: "192.0.2.8",
    sshUser: "fleet",
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
  assert.equal(invocation.args.at(-1), "uptime");
  assert.equal(result.status, "succeeded");
  assert.equal(result.output, "up 3 days\n");
});

test("times out and terminates a hung SSH process", async () => {
  let killed = false;
  const result = await runApprovedRemoteOperation({
    host: "node-1.example.test",
    sshUser: "fleet",
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
