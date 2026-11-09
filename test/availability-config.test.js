const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePositiveInteger } = require("../src/config/availability.js");

test("availability settings use the supplied fallback when unset", () => {
  assert.equal(parsePositiveInteger("HEARTBEAT_TIMEOUT_SECONDS", undefined, 30), 30);
});

test("availability settings accept positive integer values", () => {
  assert.equal(parsePositiveInteger("OFFLINE_CHECK_INTERVAL_SECONDS", "10", 5), 10);
});

test("availability settings reject zero, negative, non-numeric, fractional, and unsafe values", () => {
  for (const value of ["0", "-1", "abc", "1.5", "9007199254740992", ""]) {
    assert.throws(
      () => parsePositiveInteger("HEARTBEAT_TIMEOUT_SECONDS", value, 30),
      /HEARTBEAT_TIMEOUT_SECONDS must be a positive/,
    );
  }
});
