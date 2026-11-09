const test = require("node:test");
const assert = require("node:assert/strict");

test("node router loads with all registered controller and middleware handlers", () => {
  const nodeRouter = require("../src/routes/node.route.js");
  assert.equal(typeof nodeRouter, "function");
});
