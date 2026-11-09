const { createHash, timingSafeEqual } = require("node:crypto");

function verifyFleetOperatorBearer(authorization, configuredToken) {
  if (typeof configuredToken !== "string" || Buffer.byteLength(configuredToken) < 32) {
    return { authorized: false, code: "operator_auth_not_configured" };
  }
  if (typeof authorization !== "string" || authorization.length === 0) {
    return { authorized: false, code: "operator_credentials_required" };
  }

  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
  if (!match) return { authorized: false, code: "invalid_operator_credentials" };

  const suppliedHash = createHash("sha256").update(match[1], "utf8").digest();
  const expectedHash = createHash("sha256").update(configuredToken, "utf8").digest();
  return timingSafeEqual(suppliedHash, expectedHash)
    ? { authorized: true }
    : { authorized: false, code: "invalid_operator_credentials" };
}

function requireFleetOperator(req, res, next) {
  const result = verifyFleetOperatorBearer(req.get("authorization"), process.env.FLEET_ADMIN_TOKEN);
  if (result.authorized) return next();

  if (result.code === "operator_auth_not_configured") {
    return res.status(503).json({
      success: false,
      code: result.code,
      message: "Remote operations are disabled until operator authentication is configured",
    });
  }

  res.set("WWW-Authenticate", "Bearer");
  return res.status(401).json({
    success: false,
    code: result.code,
    message: result.code === "operator_credentials_required"
      ? "An operator bearer token is required"
      : "The operator bearer token is invalid",
  });
}

module.exports = { verifyFleetOperatorBearer, requireFleetOperator };
