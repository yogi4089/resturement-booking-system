const {
  getAvailableMenuItems,
  getAllMenuItems,
  getBookingWithAssignedTable,
  getLatestBookingByPhone,
  getTableInventory,
  getActiveOccupancyByTableIds
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

    const duration = getDurationMinutes(new Date(), Number(activeBooking.guests || table.capacity || 2));
    const bookingStart = new Date(`${activeBooking.booking_date.toISOString().slice(0, 10)}T${String(activeBooking.booking_time).slice(0, 5)}:00`);
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

    const [menuItems, tables, waitEstimate] = await Promise.all([
      getAvailableMenuItems(),
      getTableInventory(),
      buildWaitEstimate()
    ]);

    const activeOccupancyRows = await getActiveOccupancyByTableIds(tables.map((table) => table.id));
    const tablesWithTimeLeft = enrichTablesWithTimeLeft(tables, activeOccupancyRows);

    res.render("home", {
      title: "Reserve a Table",
      menuItems,
      tables: tablesWithTimeLeft,
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
    const booking = bookingId ? await getBookingWithAssignedTable(bookingId) : null;

    res.render("status", {
      title: "Booking Status",
      booking
    });
  } catch (error) {
    next(error);
  }
}

async function findBookingStatus(req, res, next) {
  try {
    const booking = await getLatestBookingByPhone(req.body.phone);
    res.render("status", {
      title: "Booking Status",
      booking
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
