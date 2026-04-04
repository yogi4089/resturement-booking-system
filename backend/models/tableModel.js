const { query } = require("../config/db");
const { hasColumns } = require("./schemaSupport");

function getCapacityRange(guests) {
  const g = Number(guests) || 1;
  let minCap = 2;
  if (g > 6) minCap = 8;
  else if (g > 4) minCap = 6;
  else if (g > 2) minCap = 4;
  
  let maxCap = minCap;
  if (minCap < 8) maxCap = minCap + 2;
  
  if (g > 8) {
    minCap = g;
    maxCap = g;
  }
  
  return { minCap, maxCap };
}

async function getTableInventory() {
  const tablesResult = await query("SELECT * FROM tables ORDER BY capacity ASC, id ASC");
  return tablesResult.rows;
}

async function getAvailableTable(guests) {
  const { minCap, maxCap } = getCapacityRange(guests);
  const supportsResetReadyAt = await hasColumns("tables", ["reset_ready_at"]);

  const sql = supportsResetReadyAt
    ? `SELECT *
       FROM tables
       WHERE status = 'AVAILABLE'
         AND (reset_ready_at IS NULL OR reset_ready_at <= NOW())
         AND capacity >= $1 AND capacity <= $2
       ORDER BY capacity ASC, id ASC
       LIMIT 1`
    : `SELECT *
       FROM tables
       WHERE status = 'AVAILABLE'
         AND capacity >= $1 AND capacity <= $2
       ORDER BY capacity ASC, id ASC
       LIMIT 1`;

  const result = await query(sql, [minCap, maxCap]);
  return result.rows[0] || null;
}

async function getAvailableTablesByCapacity(guests) {
  const { minCap, maxCap } = getCapacityRange(guests);
  const sql = `SELECT *
     FROM tables
     WHERE status = 'AVAILABLE'
       AND capacity >= $1 AND capacity <= $2
     ORDER BY capacity ASC, id ASC`;

  const result = await query(sql, [minCap, maxCap]);
  return result.rows;
}

async function getEligibleTablesByCapacity(guests) {
  const { minCap, maxCap } = getCapacityRange(guests);
  const result = await query(
    "SELECT * FROM tables WHERE capacity >= $1 AND capacity <= $2 ORDER BY capacity ASC, id ASC",
    [minCap, maxCap]
  );
  return result.rows;
}

async function getTableById(tableId) {
  const result = await query("SELECT * FROM tables WHERE id = $1", [tableId]);
  return result.rows[0] || null;
}

async function getTableCounts() {
  const [occupied, total] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM tables WHERE status = 'OCCUPIED'"),
    query("SELECT COUNT(*)::int AS count FROM tables")
  ]);

  return {
    occupiedTables: occupied.rows[0].count,
    totalTables: total.rows[0].count || 1
  };
}

async function updateTableStatus(tableId, status) {
  await query("UPDATE tables SET status = $1 WHERE id = $2", [status, tableId]);
}

async function setTableResetReadyAt(tableId, resetReadyAt) {
  const supportsResetReadyAt = await hasColumns("tables", ["reset_ready_at"]);
  if (!supportsResetReadyAt) {
    return;
  }

  await query("UPDATE tables SET reset_ready_at = $1 WHERE id = $2", [resetReadyAt, tableId]);
}

async function clearTableResetReadyAt(tableId) {
  const supportsResetReadyAt = await hasColumns("tables", ["reset_ready_at"]);
  if (!supportsResetReadyAt) {
    return;
  }

  await query("UPDATE tables SET reset_ready_at = NULL WHERE id = $1", [tableId]);
}

module.exports = {
  clearTableResetReadyAt,
  getAvailableTable,
  getAvailableTablesByCapacity,
  getEligibleTablesByCapacity,
  getTableById,
  getTableCounts,
  getTableInventory,
  setTableResetReadyAt,
  updateTableStatus
};
