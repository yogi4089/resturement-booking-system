const { query } = require("../config/db");

const cache = new Map();

async function getTableColumns(tableName) {
  if (cache.has(tableName)) {
    return cache.get(tableName);
  }

  const promise = query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )
    .then((result) => new Set(result.rows.map((row) => row.column_name)))
    .catch(() => new Set());

  cache.set(tableName, promise);
  return promise;
}

async function hasColumns(tableName, columns = []) {
  const known = await getTableColumns(tableName);
  return columns.every((column) => known.has(column));
}

function clearSchemaCache() {
  cache.clear();
}

module.exports = {
  clearSchemaCache,
  getTableColumns,
  hasColumns
};
