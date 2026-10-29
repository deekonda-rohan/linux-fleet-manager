const { Pool } = require("pg");
const fs = require("node:fs/promises");
const path = require("node:path");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL error:", err.message);
});

async function testDatabaseConnection() {
  const result = await pool.query("SELECT NOW() AS time");
  console.log("PostgreSQL connected:", result.rows[0].time);
}

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, "../../database/schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  await pool.query(schema);
  console.log("Database schema is ready");
}

module.exports = { pool, testDatabaseConnection, initializeDatabase };
