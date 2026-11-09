const express = require("express");
const {
  registerNode,
  getNodes,
  heartbeatNode,
  rotateNodeCredential,
  revokeNodeCredential,
} = require("../controllers/node.controller.js");
const { authenticateNode } = require("../middleware/authenticate-node.js");
const { requireFleetOperator } = require("../middleware/require-fleet-operator.js");
const { runRemoteOperation } = require("../controllers/remote-command.controller.js");

const router = express.Router();

router.post("/", registerNode);
router.get("/", getNodes);
router.post("/:id/heartbeat", authenticateNode, heartbeatNode);
router.post("/:id/credential/rotate", authenticateNode, rotateNodeCredential);
router.post("/:id/credential/revoke", authenticateNode, revokeNodeCredential);
router.post("/:id/commands", requireFleetOperator, runRemoteOperation);

module.exports = router;
