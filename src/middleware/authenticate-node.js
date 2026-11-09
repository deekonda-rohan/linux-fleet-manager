const { pool } = require("../config/db.js");
const { authenticateNodeCredential } = require("../services/node-credentials.js");

const AUTH_ERROR_MESSAGES = {
  credentials_required: "A bearer credential is required",
  invalid_credentials: "The bearer credential is invalid",
  credential_revoked: "The bearer credential has been revoked",
};

async function authenticateNode(req, res, next) {
  const id = req.params.id;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    return res.status(400).json({ success: false, message: "A valid node id is required" });
  }

  try {
    const result = await authenticateNodeCredential({
      nodeId: id,
      authorization: req.get("authorization"),
      pool,
    });

    if (!result.authenticated) {
      res.set("WWW-Authenticate", "Bearer");
      return res.status(401).json({
        success: false,
        code: result.code,
        message: AUTH_ERROR_MESSAGES[result.code],
      });
    }

    req.nodeCredentialHash = result.credentialHash;
    return next();
  } catch (error) {
    console.error("Node authentication failed:", error.message);
    return res.status(500).json({ success: false, message: "Failed to authenticate node" });
  }
}

module.exports = { authenticateNode };
