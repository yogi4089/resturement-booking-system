const { PRIORITY_MAP } = require("../config/constants");
const {
  createConfirmedBooking,
  createWaitingBooking,
  getAllBookings,
  getBookingById,
  getQueueList,
  getAvailableTable,
  getAvailableMenuItems,
  getTableInventory,
  getActiveOccupancyByTableIds,
  removeFromQueue,
  updateBookingStatus,
  updateTableStatus,
  addToQueue
} = require("../models");
const { buildAlternativeSlots, buildWaitEstimate, getDurationMinutes } = require("../utils/queueUtils");
const { formatTime, parseBookingDateTime } = require("../utils/timeUtils");
const { AVG_DINING_TIME } = require("../config/constants");
const { broadcastAlert } = require("../utils/sse");

async function getBaseHomeData() {
  const [menuItems, tables, waitEstimate] = await Promise.all([
    getAvailableMenuItems(),
    getTableInventory(),
    buildWaitEstimate()
  ]);
  const activeOccupancyRows = await getActiveOccupancyByTableIds(tables.map((t) => t.id));
  const tablesWithTimeLeft = enrichTablesWithTimeLeft(tables, activeOccupancyRows);

  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  
  return {
    menuItems,
    tables: tablesWithTimeLeft,
    waitEstimate,
    avgDiningTime: AVG_DINING_TIME,
    queueCount: waitEstimate.components.queueCount,
    queueAhead: waitEstimate.components.queueAhead,
    defaultBookingDate: localNow.toISOString().slice(0, 10),
    defaultBookingTime: localNow.toISOString().slice(11, 16),
    defaultBookingDayName: localNow.toLocaleDateString("en-IN", { weekday: "long" }),
    slotOffer: null,
    title: "Reserve a Table"
  };
}

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

async function createBooking(req, res, next) {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Stop taking entries between 00:00 (12 at night) and 08:00 (8 early morning)
    if (currentHour >= 0 && currentHour < 8) {
      return res.status(403).render("home", {
        ...(await getBaseHomeData()),
        title: "Bookings Closed",
        bookingRestricted: true,
        restrictedMessage: "Our online booking system is open daily from 08:00 AM to 12:00 AM. Please visit us during these hours."
      });
    }

    const { name, phone, booking_date, booking_time, guests, priority } = req.body;
    const guestCount = Number(guests);
    const bookingDateTime = parseBookingDateTime(booking_date, booking_time);
    const table = await getAvailableTable(guestCount);

    if (table) {
      return confirmBooking({
        bookingInput: { name, phone, booking_date, booking_time, guests: guestCount },
        tableId: table.id,
        predictedWaitMinutes: 0,
        req,
        res
      });
    }

    const waitEstimate = await buildWaitEstimate({
      targetDateTime: bookingDateTime,
      partySize: guestCount,
      priorityLabel: priority
    });
    const alternatives = buildAlternativeSlots(waitEstimate, 4);
    return renderHomeWithOffer({
      req,
      res,
      formData: { name, phone, booking_date, booking_time, guests: guestCount, priority },
      waitEstimate,
      alternatives
    });
  } catch (error) {
    next(error);
  }
}

async function createBookingFromAlternative(req, res, next) {
  try {
    const { name, phone, booking_date, booking_time, guests, priority } = req.body;
    const guestCount = Number(guests);
    const bookingDateTime = parseBookingDateTime(booking_date, booking_time);
    const table = await getAvailableTable(guestCount);

    if (table) {
      return confirmBooking({
        bookingInput: { name, phone, booking_date, booking_time, guests: guestCount },
        tableId: table.id,
        predictedWaitMinutes: 0,
        req,
        res
      });
    }

    return addBookingToWaitingList({
      req,
      res,
      bookingInput: { name, phone, booking_date, booking_time, guests: guestCount, priority },
      bookingDateTime,
      sourceText: "Selected slot is still busy. Added to waiting list"
    });
  } catch (error) {
    next(error);
  }
}

async function joinWaitingList(req, res, next) {
  try {
    const { name, phone, booking_date, booking_time, guests, priority } = req.body;
    const guestCount = Number(guests);
    const bookingDateTime = parseBookingDateTime(booking_date, booking_time);

    return addBookingToWaitingList({
      req,
      res,
      bookingInput: { name, phone, booking_date, booking_time, guests: guestCount, priority },
      bookingDateTime,
      sourceText: "Added to waiting list"
    });
  } catch (error) {
    next(error);
  }
}

async function getWaitEstimate(req, res, next) {
  try {
    const { booking_date, booking_time, guests, priority } = req.query;
    const bookingDateTime = parseBookingDateTime(booking_date, booking_time);
    const waitEstimate = await buildWaitEstimate({
      targetDateTime: bookingDateTime,
      partySize: Number(guests || 0),
      priorityLabel: priority || "STANDARD"
    });
    const alternatives = buildAlternativeSlots(waitEstimate, 4);
    res.json({
      ...waitEstimate,
      alternatives
    });
  } catch (error) {
    next(error);
  }
}

async function confirmBooking({ bookingInput, tableId, predictedWaitMinutes = 0, req, res }) {
  const booking = await createConfirmedBooking({
    name: bookingInput.name,
    phone: bookingInput.phone,
    bookingDate: bookingInput.booking_date,
    bookingTime: bookingInput.booking_time,
    guests: bookingInput.guests,
    tableId,
    predictedWaitMinutes
  });
  await updateTableStatus(tableId, "OCCUPIED");

  req.session.flash = {
    type: "success",
    text: `Booking confirmed! Welcome ${bookingInput.name}, your Table ${tableId} is ready.`
  };
  return res.redirect(`/status?booking=${booking.id}`);
}

async function addBookingToWaitingList({ req, res, bookingInput, bookingDateTime, sourceText }) {
  const waitEstimate = await buildWaitEstimate({
    targetDateTime: bookingDateTime,
    partySize: bookingInput.guests,
    priorityLabel: bookingInput.priority
  });
  const waitingBooking = await createWaitingBooking({
    name: bookingInput.name,
    phone: bookingInput.phone,
    bookingDate: bookingInput.booking_date,
    bookingTime: bookingInput.booking_time,
    guests: bookingInput.guests,
    waitTimeMinutes: waitEstimate.waitTime,
    predictedWaitMinutes: waitEstimate.waitTime
  });

  await addToQueue({
    bookingId: waitingBooking.id,
    priorityLabel: bookingInput.priority,
    priorityScore: PRIORITY_MAP[bookingInput.priority] || PRIORITY_MAP.STANDARD
  });

  // Fire SSE alert for VIP or Elderly guests joining the queue
  if (bookingInput.priority === 'VIP' || bookingInput.priority === 'ELDERLY') {
    broadcastAlert(
      bookingInput.priority === 'VIP' ? 'vip' : 'elderly',
      `${bookingInput.priority} joined queue — ${bookingInput.name}, ${bookingInput.guests} guest${bookingInput.guests !== 1 ? 's' : ''}`
    );
  }

  req.session.flash = {
    type: "warning",
    text: `${sourceText}. Estimated wait ~${waitEstimate.waitTime} mins (${waitEstimate.waitProfile}), earliest slot ${formatTime(waitEstimate.earliestEligibleSlot)}.`
  };
  return res.redirect(`/status?booking=${waitingBooking.id}`);
}

async function renderHomeWithOffer({ req, res, formData, waitEstimate, alternatives }) {
  const baseData = await getBaseHomeData();
  
  return res.status(409).render("home", {
    ...baseData,
    slotOffer: {
      formData,
      waitEstimate,
      alternatives
    }
  });
}

async function getBookings(req, res, next) {
  try {
    const bookings = await getAllBookings();
    res.json(bookings);
  } catch (error) {
    next(error);
  }
}

async function getQueue(req, res, next) {
  try {
    const queue = await getQueueList();
    res.json(queue);
  } catch (error) {
    next(error);
  }
}

async function cancelBooking(req, res, next) {
  try {
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      req.session.flash = { type: "danger", text: "Booking not found." };
      return res.redirect("/status");
    }

    await updateBookingStatus(booking.id, "CANCELLED");
    await removeFromQueue(booking.id);

    if (booking.table_id) {
      await updateTableStatus(booking.table_id, "AVAILABLE");
    }

    req.session.flash = { type: "info", text: "Booking cancelled successfully." };
    return res.redirect("/status");
  } catch (error) {
    next(error);
  }
}

module.exports = {
  cancelBooking,
  createBooking,
  createBookingFromAlternative,
  getBookings,
  getQueue,
  getWaitEstimate,
  joinWaitingList
};
