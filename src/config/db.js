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
  const credentialMigrationPath = path.join(__dirname, "../../database/migrations/001_node_credentials.sql");
  const exporterMigrationPath = path.join(__dirname, "../../database/migrations/002_node_exporter_endpoints.sql");
  const commandAuditMigrationPath = path.join(__dirname, "../../database/migrations/003_remote_command_audit.sql");
  const remoteOperationsMigrationPath = path.join(__dirname, "../../database/migrations/004_remote_diagnostic_operations.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  const credentialMigration = await fs.readFile(credentialMigrationPath, "utf8");
  const exporterMigration = await fs.readFile(exporterMigrationPath, "utf8");
  const commandAuditMigration = await fs.readFile(commandAuditMigrationPath, "utf8");
  const remoteOperationsMigration = await fs.readFile(remoteOperationsMigrationPath, "utf8");
  await pool.query(schema);
  await pool.query(credentialMigration);
  await pool.query(exporterMigration);
  await pool.query(commandAuditMigration);
  await pool.query(remoteOperationsMigration);
  console.log("Database schema is ready");
}

module.exports = { pool, testDatabaseConnection, initializeDatabase };
