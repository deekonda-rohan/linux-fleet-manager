const express = require('express');
const healthCheckRouter = require("./routes/healthcheck.route.js");
const nodeRouter = require("./routes/node.route.js");

const app = express();

app.use(express.json());

app.use('/api/health',healthCheckRouter);
app.use('/api/node',nodeRouter);


module.exports = app;