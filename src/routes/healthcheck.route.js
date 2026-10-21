const express = require('express');
const healthCheckController = require("../controllers/healthcheck.controller.js");

const router = express.Router();

router.get('/',healthCheckController);

module.exports = router;