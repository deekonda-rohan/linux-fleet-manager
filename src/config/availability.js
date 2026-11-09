function parsePositiveInteger(name, value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a positive safe integer`);
  }

  return parsed;
}

const HEARTBEAT_TIMEOUT_SECONDS = parsePositiveInteger(
  "HEARTBEAT_TIMEOUT_SECONDS",
  process.env.HEARTBEAT_TIMEOUT_SECONDS,
  30,
);
const OFFLINE_CHECK_INTERVAL_SECONDS = parsePositiveInteger(
  "OFFLINE_CHECK_INTERVAL_SECONDS",
  process.env.OFFLINE_CHECK_INTERVAL_SECONDS,
  10,
);

module.exports = {
  HEARTBEAT_TIMEOUT_SECONDS,
  OFFLINE_CHECK_INTERVAL_SECONDS,
  parsePositiveInteger,
};
