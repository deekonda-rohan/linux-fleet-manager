require("dotenv").config();
const app = require("./app.js");
const { pool, testDatabaseConnection } = require("./config/db.js");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Fleet Manager running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();

setInterval(async () => {
  try {
    await pool.query(`
      UPDATE nodes
      SET status = 'offline'
      WHERE status = 'online'
        AND last_seen_at < NOW() - INTERVAL '30 seconds'
    `);
  } catch (error) {
    console.error("Availability check failed:", error.message);
  }
}, 10000);
