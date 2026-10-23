const express = require("express");
const {
  registerNode,
  getNodes,
  heartbeatNode,
} = require("../controllers/node.controller.js");

const router = express.Router();

router.post("/", registerNode);
router.get("/", getNodes);
router.post("/:id/heartbeat", heartbeatNode);

module.exports = router;
