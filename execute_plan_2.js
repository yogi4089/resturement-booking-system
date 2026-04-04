const fs = require('fs');
const path = require('path');

const bDir = 'e:/New folder/resturent managment/backend';

// 6. server.js
const srvPath = path.join(bDir, 'server.js');
let srvStr = fs.readFileSync(srvPath, 'utf8');

const srvImport = "const { autoAssignReadyTables } = require('./utils/queueUtils');";
if (!srvStr.includes('autoAssignReadyTables')) {
  srvStr = srvImport + '\n' + srvStr;
  srvStr = srvStr.replace('app.listen(', 'setInterval(autoAssignReadyTables, 10000);\n\napp.listen(');
  fs.writeFileSync(srvPath, srvStr);
}

// 4. adminController fix check (in case it didn't complete due to the crash in step 6)
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
if (ctrlStr.includes(oldCtrl)) {
  ctrlStr = ctrlStr.replace(oldCtrl, newCtrl);
  fs.writeFileSync(ctrlPath, ctrlStr);
}

console.log('Implementation script complete.');
