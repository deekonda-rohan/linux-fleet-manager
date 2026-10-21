const healthcheck = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Linux Fleet Manager API is running",
    timestamp: new Date().toISOString(),
  });
};

module.exports = healthcheck;