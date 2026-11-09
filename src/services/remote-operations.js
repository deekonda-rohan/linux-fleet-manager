const { spawn } = require("node:child_process");
const { isIP } = require("node:net");

const APPROVED_OPERATIONS = Object.freeze({
  uptime: "uptime",
  disk_usage: "df -h -x tmpfs -x devtmpfs",
  memory_usage: "free -h",
  kernel_info: "uname -srmo",
});
const HOSTNAME_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const SSH_USER_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

function isValidSshHost(host) {
  if (typeof host !== "string" || host.length === 0 || host.length > 253) return false;
  if (isIP(host) !== 0) return true;
  const labels = host.endsWith(".") ? host.slice(0, -1).split(".") : host.split(".");
  return labels.every((label) => HOSTNAME_LABEL.test(label));
}

function buildSshArguments({ host, sshUser, operation }) {
  if (!Object.hasOwn(APPROVED_OPERATIONS, operation)) {
    throw new Error("Operation is not approved");
  }
  if (!isValidSshHost(host)) {
    throw new Error("Node has an invalid SSH host address");
  }
  if (typeof sshUser !== "string" || !SSH_USER_PATTERN.test(sshUser)) {
    throw new Error("SSH user is not configured correctly");
  }

  return [
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "PasswordAuthentication=no",
    "-o", "ConnectTimeout=5",
    "-l", sshUser,
    host,
    APPROVED_OPERATIONS[operation],
  ];
}

function runApprovedRemoteOperation({
  host,
  sshUser,
  operation,
  spawnImpl = spawn,
  timeoutMs = 10000,
  maxOutputBytes = 8192,
}) {
  const args = buildSshArguments({ host, sshUser, operation });

  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timedOut = false;
    let outputExceeded = false;
    let stdout = Buffer.alloc(0);
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    try {
      child = spawnImpl("ssh", args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      finish({ status: "failed", exitCode: null, errorCode: "ssh_unavailable", output: "" });
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch {}
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const next = Buffer.from(chunk);
      const remaining = maxOutputBytes - stdout.length;
      if (next.length > remaining) {
        stdout = Buffer.concat([stdout, next.subarray(0, Math.max(remaining, 0))]);
        outputExceeded = true;
        try { child.kill(); } catch {}
        return;
      }
      stdout = Buffer.concat([stdout, next]);
    });
    child.stderr.on("data", () => {});
    child.once("error", (error) => {
      finish({
        status: "failed",
        exitCode: null,
        errorCode: error.code === "ENOENT" ? "ssh_unavailable" : "ssh_failed",
        output: stdout.toString("utf8"),
      });
    });
    child.once("close", (code) => {
      if (timedOut) {
        finish({ status: "timed_out", exitCode: code, errorCode: "timeout", output: stdout.toString("utf8") });
      } else if (outputExceeded) {
        finish({ status: "failed", exitCode: code, errorCode: "output_limit", output: stdout.toString("utf8") });
      } else if (code === 0) {
        finish({ status: "succeeded", exitCode: 0, errorCode: null, output: stdout.toString("utf8") });
      } else {
        finish({ status: "failed", exitCode: code, errorCode: "remote_exit_nonzero", output: stdout.toString("utf8") });
      }
    });
  });
}

module.exports = {
  APPROVED_OPERATIONS,
  isValidSshHost,
  buildSshArguments,
  runApprovedRemoteOperation,
};
