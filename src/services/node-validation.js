const { isIP } = require("node:net");

const HOSTNAME_LABEL = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

function validateNodePayload(body) {
  const errors = {};
  const payload =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};

  if (typeof payload.name !== "string" || payload.name.trim().length === 0) {
    errors.name = "name is required and must be a non-empty string";
  } else if (payload.name.trim().length > 100) {
    errors.name = "name must be 100 characters or fewer";
  }

  if (
    typeof payload.hostname !== "string" ||
    payload.hostname.trim().length === 0
  ) {
    errors.hostname = "hostname is required and must be a non-empty string";
  } else {
    const hostname = payload.hostname.trim();
    const labels = hostname.endsWith(".")
      ? hostname.slice(0, -1).split(".")
      : hostname.split(".");
    if (
      hostname.length > 253 ||
      labels.some((label) => !HOSTNAME_LABEL.test(label))
    ) {
      errors.hostname = "hostname must be a valid DNS hostname";
    }
  }

  if (
    typeof payload.ip_address !== "string" ||
    payload.ip_address.trim().length === 0
  ) {
    errors.ip_address = "ip_address is required and must be a non-empty string";
  } else if (isIP(payload.ip_address.trim()) === 0) {
    errors.ip_address = "ip_address must be a valid IPv4 or IPv6 address";
  }

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  return {
    value: {
      name: payload.name.trim(),
      hostname: payload.hostname.trim(),
      ip_address: payload.ip_address.trim(),
    },
  };
}

module.exports = { validateNodePayload };
