const app = require("./app");
const { autoAssignReadyTables } = require("./utils/queueUtils");
const { getOverdueTables } = require("./models/dashboardModel");
const { broadcastAlert } = require("./utils/sse");

const PORT = process.env.PORT || 3000;

setInterval(autoAssignReadyTables, 10000);

// Overdue table alert daemon — fires every 60s
// Tracks already-alerted table IDs so we don't spam on every cycle
const alertedOverdueTables = new Set();
setInterval(async () => {
  try {
    const overdue = await getOverdueTables();
    for (const row of overdue) {
      const key = `${row.table_id}`;
      if (!alertedOverdueTables.has(key)) {
        alertedOverdueTables.add(key);
        broadcastAlert(
          'overdue',
          `Table ${row.table_id} overdue by ${row.overdue_minutes} min — ${row.name} (${row.guests} guests)`
        );
      }
    }
    // Clear resolved tables from the set (table no longer in overdue list)
    const overdueKeys = new Set(overdue.map(r => `${r.table_id}`));
    for (const key of alertedOverdueTables) {
      if (!overdueKeys.has(key)) {
        alertedOverdueTables.delete(key);
      }
    }
  } catch (err) {
    // Silently ignore DB errors during daemon cycle
  }
}, 60000);

app.listen(PORT, () => {
  console.log(`Restaurant management app running on http://localhost:${PORT}`);
});
