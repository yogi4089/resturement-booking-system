const fs = require('fs');
const ctrlPath = 'e:/New folder/resturent managment/backend/controllers/adminController.js';
let ctrlStr = fs.readFileSync(ctrlPath, 'utf8');

ctrlStr = ctrlStr.replace('  getTableInventory,', '  getNextQueueBookingForCapacity,\n  getTableInventory,');
fs.writeFileSync(ctrlPath, ctrlStr);
console.log('Fixed import');
