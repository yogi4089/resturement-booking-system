const fs = require('fs');
const path = require('path');

const ctrlPath = 'e:/New folder/resturent managment/backend/controllers/adminController.js';
let ctrlStr = fs.readFileSync(ctrlPath, 'utf8');

// 1. Import getNextQueueBookingForCapacity if not present
if (!ctrlStr.includes('getNextQueueBookingForCapacity')) {
  // Find where queueModel is imported, or just append it to the top
  const importSearch = 'const { getQueueAheadForParty } = require("../models/queueModel");';
  const importReplace = 'const { getQueueAheadForParty, getNextQueueBookingForCapacity } = require("../models/queueModel");';
  if (ctrlStr.includes(importSearch)) {
    ctrlStr = ctrlStr.replace(importSearch, importReplace);
  } else {
    // Just inject it after the requires
    ctrlStr = ctrlStr.replace(/const \{ getTableInventory.*?\n/, (match) => match + 'const { getNextQueueBookingForCapacity } = require("../models/queueModel");\n');
  }
}

// 2. Change renderAdminTablesPage
const mapSearch = `    const tableCards = tables.map((table) => {
      const activeBooking = bookingByTableId.get(Number(table.id)) || null;
      const resetReadyAt = table.reset_ready_at ? new Date(table.reset_ready_at) : null;

      let customerFreeAt = null;
      let tableFreeAt = null;
      let timeUntilCustomerFree = 0;
      let timeUntilTableFree = 0;
      let seatedSinceMinutes = null;
      let customerName = "No active customer";
      let customerPhone = "-";

      if (activeBooking) {
        customerName = activeBooking.name;
        customerPhone = activeBooking.phone;`;

const mapReplace = `    const tableCards = await Promise.all(tables.map(async (table) => {
      const activeBooking = bookingByTableId.get(Number(table.id)) || null;
      const resetReadyAt = table.reset_ready_at ? new Date(table.reset_ready_at) : null;

      let customerFreeAt = null;
      let tableFreeAt = null;
      let timeUntilCustomerFree = 0;
      let timeUntilTableFree = 0;
      let seatedSinceMinutes = null;
      let customerName = "No active customer";
      let customerPhone = "-";

      if (activeBooking) {
        customerName = activeBooking.name;
        customerPhone = activeBooking.phone;
      }
      
      const isBuffer = table.status === "AVAILABLE" && resetReadyAt && resetReadyAt > now;
      if (isBuffer) {
        const nextInLine = await getNextQueueBookingForCapacity(table.capacity);
        if (nextInLine) {
          customerName = "Next: " + nextInLine.name;
          customerPhone = "";
        } else {
          customerName = "Next: Pending...";
          customerPhone = "";
        }
      }

      if (activeBooking && !isBuffer) {`;

if (ctrlStr.includes(mapSearch)) {
  ctrlStr = ctrlStr.replace(mapSearch, mapReplace);
  // Also need to close Promise.all
  
  // Notice: the `return { ...table, activeBooking, ... }; });` needs closing bracket for Promise.all.
  const mapEndSearch = `        timeUntilTableFree
      };
    });`;
  const mapEndReplace = `        timeUntilTableFree
      };
    }));`;
  ctrlStr = ctrlStr.replace(mapEndSearch, mapEndReplace);
}

// 3. Fix missing broadcastUpdate in updateAdminTableStatus
const statusSearch = `    await clearTableResetReadyAt(tableId);
    await updateTableStatus(tableId, "OCCUPIED");
    req.session.flash = { type: "warning", text: "Table marked as occupied." };
    return res.redirect(returnTo);`;

const statusReplace = `    await clearTableResetReadyAt(tableId);
    await updateTableStatus(tableId, "OCCUPIED");
    broadcastUpdate();
    req.session.flash = { type: "warning", text: "Table marked as occupied." };
    return res.redirect(returnTo);`;

if (ctrlStr.includes(statusSearch)) {
  ctrlStr = ctrlStr.replace(statusSearch, statusReplace);
}

fs.writeFileSync(ctrlPath, ctrlStr);
console.log('adminController patched.');
