require("dotenv").config();
const app = require("./app.js");
const {
  pool,
  testDatabaseConnection,
  initializeDatabase,
} = require("./config/db.js");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await testDatabaseConnection();
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Fleet Manager running on port ${PORT}`);
    });

    setInterval(async () => {
      try {
        const result = await pool.query(`
                        UPDATE nodes
                        SET status = 'offline'
                        WHERE status = 'online'
                          AND last_seen_at < NOW() - INTERVAL '30 seconds'
                        RETURNING id, name
                      `);

        for (const node of result.rows) {
          console.log(`Node ${node.name} is now offline`);
        }
      } catch (error) {
        console.error("Availability check failed:", error.message);
      }
    }, 10000);
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error.message);
    process.exit(1);
  }
}

startServer();
