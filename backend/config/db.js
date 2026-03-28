const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/restaurant_management";

const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}

module.exports = {
  pool,
  query
};
