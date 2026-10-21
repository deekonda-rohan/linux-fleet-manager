const express = require('express');
const { registerNode, getNodes } = require("../controllers/node.controller.js");

const router = express.Router();

router.post('/', registerNode);
router.get('/', getNodes);

module.exports = router;
