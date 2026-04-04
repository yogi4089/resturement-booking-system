const fs = require('fs');
const path = require('path');

const bDir = 'e:/New folder/resturent managment/backend';

// 1. constants.js
const constPath = path.join(bDir, 'config', 'constants.js');
let constStr = fs.readFileSync(constPath, 'utf8');
constStr = constStr.replace('const RESET_BUFFER_MINUTES = 8;', 'const RESET_BUFFER_MINUTES = 2;');
fs.writeFileSync(constPath, constStr);

// 2. tableModel.js
const tablePath = path.join(bDir, 'models', 'tableModel.js');
let tableStr = fs.readFileSync(tablePath, 'utf8');
tableStr = tableStr.replace(/capacity < \$1 \+ 2/g, 'capacity < $1 + 4');
fs.writeFileSync(tablePath, tableStr);

// 3. queueModel.js
const queuePath = path.join(bDir, 'models', 'queueModel.js');
let queueStr = fs.readFileSync(queuePath, 'utf8');
queueStr = queueStr.replace(/b\.guests > \$1 \- 2/g, 'b.guests > $1 - 4');
fs.writeFileSync(queuePath, queueStr);

// 4. adminController.js
const ctrlPath = path.join(bDir, 'controllers', 'adminController.js');
let ctrlStr = fs.readFileSync(ctrlPath, 'utf8');
const oldCtrl = `    if (status === "AVAILABLE") {
      const resetReadyAt = getResetReadyAtTimestamp(new Date());
      await updateTableStatus(tableId, "OCCUPIED");
      await setTableResetReadyAt(tableId, resetReadyAt);
      broadcastUpdate();`;

const newCtrl = `    if (status === "AVAILABLE") {
      const resetReadyAt = getResetReadyAtTimestamp(new Date());
      await updateTableStatus(tableId, "AVAILABLE");
      await setTableResetReadyAt(tableId, resetReadyAt);
      broadcastUpdate();`;
ctrlStr = ctrlStr.replace(oldCtrl, newCtrl);
fs.writeFileSync(ctrlPath, ctrlStr);

// 5. queueUtils.js
const utilsPath = path.join(bDir, 'utils', 'queueUtils.js');
let utilsStr = fs.readFileSync(utilsPath, 'utf8');

const autoAssignCode = `
async function autoAssignReadyTables() {
  const { broadcastUpdate } = require('./sse');
  const { query } = require('../config/db');
  
  // Find tables that are AVAILABLE and whose reset buffer has expired
  const res = await query("SELECT id FROM tables WHERE status = 'AVAILABLE' AND reset_ready_at <= NOW()");
  if (res.rows.length === 0) return;

  let assigned = false;
  for (const row of res.rows) {
    const promotedId = await promoteNextWaitingBooking(row.id);
    if (promotedId) {
      assigned = true;
    }
  }
  
  if (assigned) {
    broadcastUpdate();
  }
}
`;

if (!utilsStr.includes('autoAssignReadyTables')) {
  // inject before module.exports
  utilsStr = utilsStr.replace('module.exports = {', autoAssignCode + '\nmodule.exports = {');
  utilsStr = utilsStr.replace('module.exports = {', 'module.exports = {\n  autoAssignReadyTables,');
  fs.writeFileSync(utilsPath, utilsStr);
}

// 6. index.js
const idxPath = path.join(bDir, 'index.js');
let idxStr = fs.readFileSync(idxPath, 'utf8');
if (!idxStr.includes('autoAssignReadyTables')) {
  idxStr = idxStr.replace("const PORT = process.env.PORT || 5000;", "const PORT = process.env.PORT || 5000;\nconst { autoAssignReadyTables } = require('./utils/queueUtils');");
  idxStr = idxStr.replace("app.listen(PORT, () => {", "setInterval(autoAssignReadyTables, 10000);\n\napp.listen(PORT, () => {");
  fs.writeFileSync(idxPath, idxStr);
}

console.log('Implementation script complete.');
