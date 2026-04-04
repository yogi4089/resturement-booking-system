const fs = require('fs');

// 1. Update adminRoutes.js
let routesPath = 'e:/New folder/resturent managment/backend/routes/adminRoutes.js';
let routesStr = fs.readFileSync(routesPath, 'utf8');

if (!routesStr.includes('eventsHandler')) {
  routesStr = routesStr.replace('const express = require("express");', 'const express = require("express");\nconst { eventsHandler } = require("../utils/sse");');
  routesStr = routesStr.replace('module.exports = router;', 'router.get("/api/events", requireAdmin, eventsHandler);\n\nmodule.exports = router;');
  fs.writeFileSync(routesPath, routesStr);
}

// 2. Update adminController.js
let adminCtrlPath = 'e:/New folder/resturent managment/backend/controllers/adminController.js';
let adminCtrlStr = fs.readFileSync(adminCtrlPath, 'utf8');

if (!adminCtrlStr.includes('broadcastUpdate')) {
  adminCtrlStr = adminCtrlStr.replace('const { AVG_DINING_TIME', 'const { broadcastUpdate } = require("../utils/sse");\nconst { AVG_DINING_TIME');
  
  const funcNames = [
    'updateAdminTableStatus',
    'resetDoneAdminTable',
    'completeAdminBooking',
    'seatNowAdminBooking',
    'extendAdminBooking',
    'promoteAdminQueueBooking',
    'addAdminWaitingTime'
  ];

  for (const fn of funcNames) {
    const searchStr = `async function ${fn}(req, res, next) {\n  try {`;
    const replaceStr = searchStr;
    const endStr = `req.session.flash =`;
    const rx = new RegExp(`async function ${fn}\\(req, res, next\\) \\{[\\s\\S]*?req\\.session\\.flash =`, 'g');
    adminCtrlStr = adminCtrlStr.replace(rx, (match) => {
      // replace the last occurrence of req.session.flash inside the function body
      const lastIdx = match.lastIndexOf('req.session.flash');
      return match.substring(0, lastIdx) + 'broadcastUpdate();\n    ' + match.substring(lastIdx);
    });
  }
  fs.writeFileSync(adminCtrlPath, adminCtrlStr);
}

// 3. Update bookingController.js
let bookingCtrlPath = 'e:/New folder/resturent managment/backend/controllers/bookingController.js';
let bookingCtrlStr = fs.readFileSync(bookingCtrlPath, 'utf8');

if (!bookingCtrlStr.includes('broadcastUpdate')) {
  bookingCtrlStr = bookingCtrlStr.replace('const { getDemandMultiplier', 'const { broadcastUpdate } = require("../utils/sse");\nconst { getDemandMultiplier');
  
  const rx = new RegExp(`async function handleBookingSubmit\\(req, res, next\\) \\{[\\s\\S]*?req\\.session\\.flash =`, 'g');
  bookingCtrlStr = bookingCtrlStr.replace(rx, (match) => {
      const lastIdx = match.lastIndexOf('req.session.flash');
      return match.substring(0, lastIdx) + 'broadcastUpdate();\n    ' + match.substring(lastIdx);
  });
  
  const rx2 = new RegExp(`async function handleBookingAlternative\\(req, res, next\\) \\{[\\s\\S]*?req\\.session\\.flash =`, 'g');
  bookingCtrlStr = bookingCtrlStr.replace(rx2, (match) => {
      const lastIdx = match.lastIndexOf('req.session.flash');
      return match.substring(0, lastIdx) + 'broadcastUpdate();\n    ' + match.substring(lastIdx);
  });
  
  const rx3 = new RegExp(`async function handleBookingWaitlist\\(req, res, next\\) \\{[\\s\\S]*?req\\.session\\.flash =`, 'g');
  bookingCtrlStr = bookingCtrlStr.replace(rx3, (match) => {
      const lastIdx = match.lastIndexOf('req.session.flash');
      return match.substring(0, lastIdx) + 'broadcastUpdate();\n    ' + match.substring(lastIdx);
  });
  fs.writeFileSync(bookingCtrlPath, bookingCtrlStr);
}

console.log('Backend patched.');
