const {
  getAvailableMenuItems,
  getAllMenuItems,
  getBookingWithAssignedTable,
  getLatestBookingByPhone,
  getTableInventory,
  getActiveOccupancyByTableIds,
  getQueueSizeByBucket
} = require("../models");
const { AVG_DINING_TIME } = require("../config/constants");
const { buildWaitEstimate, getDurationMinutes } = require("../utils/queueUtils");

function enrichTablesWithTimeLeft(tables, activeOccupancyRows) {
  const nowMs = Date.now();
  const occupancyByTable = new Map(activeOccupancyRows.map((row) => [Number(row.table_id), row]));

  return tables.map((table) => {
    const resetReadyAt = table.reset_ready_at ? new Date(table.reset_ready_at).getTime() : null;

    if (table.status === "AVAILABLE") {
      const resetLeft = resetReadyAt ? Math.max(0, Math.ceil((resetReadyAt - nowMs) / 60000)) : 0;
      return { ...table, timeLeftMinutes: resetLeft };
    }

    const activeBooking = occupancyByTable.get(Number(table.id));
    if (!activeBooking) {
      return { ...table, timeLeftMinutes: AVG_DINING_TIME };
    }

    const bookingStart = new Date(`${activeBooking.booking_date.toISOString().slice(0, 10)}T${String(activeBooking.booking_time).slice(0, 5)}:00`);
    const durationRef = Number.isNaN(bookingStart.getTime()) ? new Date() : bookingStart;
    const duration = getDurationMinutes(durationRef, Number(activeBooking.guests || table.capacity || 2));
    const expectedEnd = activeBooking.expected_end_at
      ? new Date(activeBooking.expected_end_at).getTime()
      : bookingStart.getTime() + duration * 60000;

    const timeLeftMinutes = Math.max(0, Math.ceil((expectedEnd - nowMs) / 60000));
    return { ...table, timeLeftMinutes };
  });
}

async function renderHomePage(req, res, next) {
  try {
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const defaultBookingDate = localNow.toISOString().slice(0, 10);
    const defaultBookingTime = localNow.toISOString().slice(11, 16);
    const defaultBookingDayName = localNow.toLocaleDateString("en-IN", { weekday: "long" });

    const [menuItems, tables, waitEstimate, queueBuckets] = await Promise.all([
      getAvailableMenuItems(),
      getTableInventory(),
      buildWaitEstimate(),
      getQueueSizeByBucket()
    ]);

    const activeOccupancyRows = await getActiveOccupancyByTableIds(tables.map((table) => table.id));
    const tablesWithTimeLeft = enrichTablesWithTimeLeft(tables, activeOccupancyRows);

    const bucketMap = {};
    queueBuckets.forEach(b => { bucketMap[b.party_bucket] = b.count; });

    // Create a tracker for distributed queues per table ID
    const tableQueues = {};
    tablesWithTimeLeft.forEach(t => tableQueues[t.id] = 0);

    // Distribute parties realistically based on overlapping capacity logic
    const bucketsToProcess = ['1-2', '3-4', '5-6', '7+'];
    bucketsToProcess.forEach(bucket => {
       const count = bucketMap[bucket] || 0;
       
       // Filter tables that can accommodate this bucket size
       const eligibleTables = tablesWithTimeLeft.filter(t => {
          const cap = t.capacity;
          if (bucket === '1-2') return cap >= 2 && cap <= 4;
          if (bucket === '3-4') return cap >= 4 && cap <= 6;
          if (bucket === '5-6') return cap >= 6 && cap <= 8;
          if (bucket === '7+') return cap >= 8;
          return false;
       });

       // Round-robin distribute the queue to ideally balance load
       if (eligibleTables.length > 0) {
          for (let i = 0; i < count; i++) {
             // Always give to the eligible table that currently has the lowest queue
             eligibleTables.sort((a, b) => tableQueues[a.id] - tableQueues[b.id]);
             tableQueues[eligibleTables[0].id] += 1;
          }
       }
    });

    const tablesWithQueue = tablesWithTimeLeft.map(t => {
       return { ...t, bucketQueue: tableQueues[t.id] || 0 };
    });

    res.render("home", {
      title: "Reserve a Table",
      menuItems,
      tables: tablesWithQueue,
      avgDiningTime: AVG_DINING_TIME,
      waitEstimate,
      queueCount: waitEstimate.components.queueCount,
      queueAhead: waitEstimate.components.queueAhead,
      defaultBookingDate,
      defaultBookingTime,
      defaultBookingDayName,
      slotOffer: null
    });
  } catch (error) {
    next(error);
  }
}

async function renderMenuPage(req, res, next) {
  try {
    const menuItems = await getAllMenuItems();
    res.render("menu", {
      title: "Menu",
      menuItems
    });
  } catch (error) {
    next(error);
  }
}

async function renderStatusPage(req, res, next) {
  try {
    const { booking: bookingId } = req.query;
    const [booking, tables, waitEstimate] = await Promise.all([
      bookingId ? getBookingWithAssignedTable(bookingId) : null,
      getTableInventory(),
      buildWaitEstimate()
    ]);

    res.render("status", {
      title: "Booking Status",
      booking,
      tables,
      waitEstimate
    });
  } catch (error) {
    next(error);
  }
}

async function findBookingStatus(req, res, next) {
  try {
    const [booking, tables, waitEstimate] = await Promise.all([
      getLatestBookingByPhone(req.body.phone),
      getTableInventory(),
      buildWaitEstimate()
    ]);

    res.render("status", {
      title: "Booking Status",
      booking,
      tables,
      waitEstimate
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  findBookingStatus,
  renderHomePage,
  renderMenuPage,
  renderStatusPage
};
