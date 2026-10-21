
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err.message);
});

async function testDatabaseConnection() {
  const result = await pool.query("SELECT NOW() AS time");
  console.log("PostgreSQL connected:", result.rows[0].time);
}

module.exports = { pool, testDatabaseConnection };
