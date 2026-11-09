const express = require('express');
const healthCheckRouter = require("./routes/healthcheck.route.js");
const nodeRouter = require("./routes/node.route.js");

const app = express();

app.use(express.json());

app.use('/api/health',healthCheckRouter);
app.use('/api/nodes',nodeRouter);

app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Request body must contain valid JSON",
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body is too large",
    });
  }

  console.error("Unhandled request error:", err.message);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

module.exports = app;
