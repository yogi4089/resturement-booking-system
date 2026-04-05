const {
  addWaitingMinutes,
  addWaitingMinutesForEtaWindow,
  assignBookingToTable,
  clearTableResetReadyAt,
  createMenuItem,
  deleteMenuItem,
  extendBookingExpectedEnd,
  getAllMenuItems,
  getAvailableTable,
  getAvailableTablesByCapacity,
  getBookingById,
  getLatestConfirmedBookingsByTableIds,
  getQueueList,
  getTableById,
  getNextQueueBookingForCapacity,
  getTableInventory,
  markBookingSeated,
  removeFromQueue,
  setTableResetReadyAt,
  toggleMenuAvailability,
  updateBookingStatus,
  updateTableStatus
} = require("../models");
const { broadcastUpdate } = require("../utils/sse");
const { AVG_DINING_TIME, RESET_BUFFER_MINUTES } = require("../config/constants");
const { getDurationMinutes, getResetReadyAtTimestamp, promoteNextWaitingBooking } = require("../utils/queueUtils");

function renderAdminLogin(req, res) {
  res.render("admin-login", {
    title: "Admin Login"
  });
}

function loginAdmin(req, res) {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || "admin";
  const adminPass = process.env.ADMIN_PASS || "admin123";

  if (username === adminUser && password === adminPass) {
    req.session.admin = true;
    req.session.flash = { type: "success", text: "Logged in successfully." };
    return res.redirect("/admin");
  }

  req.session.flash = { type: "danger", text: "Invalid admin credentials." };
  return res.redirect("/admin/login");
}

function logoutAdmin(req, res) {
  req.session.destroy(() => {
    res.redirect("/");
  });
}

function redirectAdminRoot(req, res) {
  return res.redirect("/admin/tables");
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBookingStartTime(booking, fallback = null) {
  if (!booking) {
    return fallback;
  }

  // Use the actual seated time if available
  if (booking.seated_at) {
    return new Date(booking.seated_at);
  }

  // If not seated, don't fall back to booking time for "Seated since" tracking.
  // This prevents the UI from showing a high "Seated since" duration 
  // for a guest who was just promoted but hasn't physically sat down yet.
  return fallback;
}

function computeExpectedCustomerFreeAt(booking, fallback = new Date()) {
  if (!booking) {
    return fallback;
  }

  // Prefer the persisted expected_end_at (set by markBookingSeated / extendBookingExpectedEnd)
  if (booking.expected_end_at) {
    return new Date(booking.expected_end_at);
  }

  // Fallback: estimate from seated_at (or booking scheduled time) + duration
  // Duration is derived from the booking's OWN scheduled date+time so the day/hour
  // profile (lunch/dinner/weekend) matches what was actually booked — not today's wall clock.
  const start = getBookingStartTime(booking, fallback);

  // Build a reference datetime from the booking's scheduled slot when available,
  // so Saturday-night logic only fires for bookings actually made on Saturday night.
  let durationRef = start;
  if (booking.booking_date && booking.booking_time) {
    const parsed = new Date(`${booking.booking_date}T${String(booking.booking_time).slice(0, 5)}:00`);
    if (!Number.isNaN(parsed.getTime())) {
      durationRef = parsed;
    }
  }

  const duration = getDurationMinutes(durationRef, safeNumber(booking.guests, 2)) || AVG_DINING_TIME;
  return new Date(start.getTime() + duration * 60000);
}

function minutesUntil(targetDate, now = new Date()) {
  return Math.max(0, Math.ceil((targetDate.getTime() - now.getTime()) / 60000));
}

function minutesSince(targetDate, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - targetDate.getTime()) / 60000));
}

function formatRelativeMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function formatDateTimeLabel(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDateOnlyLabel(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function format12HourTime(timeStr) {
  if (!timeStr) return "-";
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parsePositiveInt(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function paginateRows(rows, requestedPage, perPage = 20) {
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const currentPage = Math.min(parsePositiveInt(requestedPage, 1), totalPages);
  const startIndex = (currentPage - 1) * perPage;
  const pageRows = rows.slice(startIndex, startIndex + perPage);

  return {
    rows: pageRows,
    meta: {
      perPage,
      totalItems,
      totalPages,
      currentPage,
      hasPrev: currentPage > 1,
      hasNext: currentPage < totalPages,
      prevPage: currentPage > 1 ? currentPage - 1 : 1,
      nextPage: currentPage < totalPages ? currentPage + 1 : totalPages,
      startItem: totalItems ? startIndex + 1 : 0,
      endItem: totalItems ? Math.min(startIndex + perPage, totalItems) : 0,
      pageNumbers: Array.from({ length: totalPages }, (_, idx) => idx + 1)
    }
  };
}

function sortWaitingRows(rows, sortBy) {
  const cloned = [...rows];
  const now = Date.now();

  switch (sortBy) {
    case "wait_desc":
      return cloned.sort((a, b) => {
        const waitDiff = safeNumber(b.waitRemainingMinutes) - safeNumber(a.waitRemainingMinutes);
        if (waitDiff !== 0) return waitDiff;
        return safeNumber(b.priority_score) - safeNumber(a.priority_score);
      });
    case "excess_time_desc":
      // Sort: VIP first, then ELDERLY, then STANDARD. Within same priority, most overdue first.
      return cloned.sort((a, b) => {
        const priorityDiff = safeNumber(b.priority_score) - safeNumber(a.priority_score);
        if (priorityDiff !== 0) return priorityDiff;
        const aWaitingTill = a.waitingTill ? new Date(a.waitingTill).getTime() : now;
        const bWaitingTill = b.waitingTill ? new Date(b.waitingTill).getTime() : now;
        const aExcess = Math.max(0, now - aWaitingTill);
        const bExcess = Math.max(0, now - bWaitingTill);
        return bExcess - aExcess; // most overdue first within same priority
      });
    case "guest_asc":
      return cloned.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    case "schedule_asc":
      return cloned.sort((a, b) => {
        const aDate = a.waitingTill ? new Date(a.waitingTill).getTime() : 0;
        const bDate = b.waitingTill ? new Date(b.waitingTill).getTime() : 0;
        return aDate - bDate;
      });
    case "priority_arrival":
    default:
      return cloned.sort((a, b) => {
        const aExpiry = a.waitingTill ? new Date(a.waitingTill).getTime() : now;
        const bExpiry = b.waitingTill ? new Date(b.waitingTill).getTime() : now;

        const aOverdue = aExpiry <= now ? 0 : 1;
        const bOverdue = bExpiry <= now ? 0 : 1;

        if (aOverdue !== bOverdue) return aOverdue - bOverdue;

        const priorityDiff = safeNumber(b.priority_score) - safeNumber(a.priority_score);
        if (priorityDiff !== 0) return priorityDiff;

        return aExpiry - bExpiry;
      });
  }
}

function sortOccupiedRows(rows, sortBy) {
  const cloned = [...rows];

  switch (sortBy) {
    case "table_asc":
      return cloned.sort((a, b) => safeNumber(a.tableNumber) - safeNumber(b.tableNumber));
    case "seated_newest":
      return cloned.sort((a, b) => b.seatedAt.getTime() - a.seatedAt.getTime());
    case "free_soon":
    default:
      return cloned.sort((a, b) => safeNumber(a.remainingMinutes) - safeNumber(b.remainingMinutes));
  }
}

function toQueryString(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      qs.set(key, String(value));
    }
  });
  return qs.toString();
}
async function renderAdminTablesPage(req, res, next) {
  try {
    const now = new Date();
    const tables = await getTableInventory();
    const latestByTable = await getLatestConfirmedBookingsByTableIds(tables.map((table) => table.id));
    const bookingByTableId = new Map(latestByTable.map((row) => [Number(row.table_id), row]));

    const tableCards = await Promise.all(tables.map(async (table) => {
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

      if (activeBooking && !isBuffer) {
        const bookingStart = getBookingStartTime(activeBooking, null);
        seatedSinceMinutes = bookingStart ? minutesSince(bookingStart, now) : null;

        customerFreeAt = computeExpectedCustomerFreeAt(activeBooking, now);
        timeUntilCustomerFree = minutesUntil(customerFreeAt, now);
      }

      if (table.status === "AVAILABLE") {
        tableFreeAt = resetReadyAt && resetReadyAt > now ? resetReadyAt : now;
      } else if (resetReadyAt && resetReadyAt > now) {
        tableFreeAt = resetReadyAt;
      } else if (customerFreeAt) {
        tableFreeAt = customerFreeAt;
      } else {
        tableFreeAt = new Date(now.getTime() + AVG_DINING_TIME * 60000);
      }

      timeUntilTableFree = minutesUntil(tableFreeAt, now);

      return {
        ...table,
        activeBooking,
        customerName,
        customerPhone,
        seatedSinceMinutes,
        seatedSinceIso: activeBooking && !isBuffer && getBookingStartTime(activeBooking, null) ? getBookingStartTime(activeBooking, null).toISOString() : null,
        seatedSinceLabel: seatedSinceMinutes === null ? (activeBooking && !isBuffer ? "Assigned (waiting to sit)" : "-") : formatRelativeMinutes(seatedSinceMinutes),
        customerFreeAtLabel: formatDateTimeLabel(customerFreeAt),
        tableFreeAtLabel: formatDateTimeLabel(tableFreeAt),
        timeUntilCustomerFree,
        timeUntilCustomerFreeLabel: formatRelativeMinutes(timeUntilCustomerFree),
        timeUntilTableFree,
        timeUntilTableFreeLabel: formatRelativeMinutes(timeUntilTableFree),
        resetInProgress: Boolean(resetReadyAt && resetReadyAt > now)
      };
    }));

    res.render("admin-tables", {
      title: "Admin Tables",
      activeAdminTab: "tables",
      tableCards,
      resetBufferMinutes: RESET_BUFFER_MINUTES
    });
  } catch (error) {
    next(error);
  }
}

async function renderAdminWaitingListPage(req, res, next) {
  try {
    const now = new Date();
    const [queueRows, tables] = await Promise.all([
      getQueueList(),
      getTableInventory()
    ]);

    const waitingRawRows = await Promise.all(
      queueRows.map(async (entry) => {
        const waitMinutes = safeNumber(entry.wait_time_minutes, 0);

        // Use booking_time as the base for both Schedule and Waiting Till so all columns are consistent.
        // arrival_time (queue join time) != booking_time (reservation time) and caused +Xm excess to be wrong.
        const [h, m] = String(entry.booking_time).split(':');
        const dateStr = formatDateOnlyLabel(entry.booking_date); // "YYYY-MM-DD"
        const baseScheduleMs = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`).getTime();
        const scheduleDate = new Date(baseScheduleMs + waitMinutes * 60000);

        // waitingTill = scheduleDate (same base), so "Waiting Till" and "Schedule" always match
        const waitingTill = scheduleDate;
        const waitRemainingMinutes = minutesUntil(waitingTill, now);
        const candidateTables = await getAvailableTablesByCapacity(entry.guests || 1);

        return {
          ...entry,
          waitingTill,
          waitRemainingMinutes,
          waitRemainingLabel: waitRemainingMinutes > 0
            ? formatRelativeMinutes(waitRemainingMinutes)
            : `0m (+${formatRelativeMinutes(minutesSince(waitingTill, now))})`,
          waitingTillLabel: formatDateTimeLabel(waitingTill),
          scheduleLabel: formatDateTimeLabel(scheduleDate),
          candidateTables,
          suggestedTableId: candidateTables.length ? candidateTables[0].id : null
        };
      })
    );

    const occupiedTables = tables.filter((table) => table.status === "OCCUPIED");
    const activeBookings = await getLatestConfirmedBookingsByTableIds(occupiedTables.map((table) => table.id));

    const occupiedRawRows = activeBookings.map((booking) => {
      const table = occupiedTables.find((row) => Number(row.id) === Number(booking.table_id));
      const seatedAt = getBookingStartTime(booking, now);
      const expectedFreeAt = computeExpectedCustomerFreeAt(booking, now);
      const remainingMinutes = minutesUntil(expectedFreeAt, now);

      return {
        tableNumber: booking.table_id,
        tableCapacity: table ? table.capacity : booking.table_capacity,
        booking,
        seatedAt,
        seatedAtLabel: formatDateTimeLabel(seatedAt),
        expectedFreeAt,
        expectedFreeAtLabel: formatDateTimeLabel(expectedFreeAt),
        remainingMinutes,
        remainingLabel: formatRelativeMinutes(remainingMinutes)
      };
    });

    const activeView = ["waiting", "booked", "ready"].includes(String(req.query.view || ""))
      ? String(req.query.view)
      : "waiting";

    const waitingSearch = String(req.query.wSearch || "").trim();
    const waitingPriority = String(req.query.wPriority || "ALL").toUpperCase();
    const waitingSort = String(req.query.wSort || "priority_arrival");
    const waitingPage = parsePositiveInt(req.query.wPage, 1);

    const bookedSearch = String(req.query.bSearch || "").trim();
    const bookedSort = String(req.query.bSort || "free_soon");
    const bookedPage = parsePositiveInt(req.query.bPage, 1);

    const readySearch = String(req.query.rSearch || "").trim();
    const readyPriority = String(req.query.rPriority || "ALL").toUpperCase();
    const readySort = String(req.query.rSort || "priority_arrival");
    const readyPage = parsePositiveInt(req.query.rPage, 1);

    const waitingSearchText = normalizeText(waitingSearch);
    const filteredWaiting = waitingRawRows.filter((row) => {
      const matchesPriority = waitingPriority === "ALL" || String(row.priority_label || "").toUpperCase() === waitingPriority;
      if (!matchesPriority) {
        return false;
      }

      if (!waitingSearchText) {
        return true;
      }

      const haystack = [
        row.booking_id,
        row.name,
        row.phone,
        row.scheduleLabel,
        row.status,
        row.priority_label
      ].map((value) => normalizeText(value)).join(" ");

      return haystack.includes(waitingSearchText);
    });

    const sortedWaiting = sortWaitingRows(filteredWaiting, waitingSort);
    const waitingPaginated = paginateRows(sortedWaiting, waitingPage, 20);

    const bookedSearchText = normalizeText(bookedSearch);
    const filteredBooked = occupiedRawRows.filter((row) => {
      if (!bookedSearchText) {
        return true;
      }

      const haystack = [
        row.tableNumber,
        row.booking.id,
        row.booking.name,
        row.booking.phone,
        row.booking.guests,
        row.expectedFreeAtLabel
      ].map((value) => normalizeText(value)).join(" ");

      return haystack.includes(bookedSearchText);
    });

    const sortedBooked = sortOccupiedRows(filteredBooked, bookedSort);
    const bookedPaginated = paginateRows(sortedBooked, bookedPage, 20);

    const readySearchText = normalizeText(readySearch);
    const readyRawRows = waitingRawRows.filter((row) => safeNumber(row.waitRemainingMinutes) === 0);
    const filteredReady = readyRawRows.filter((row) => {
      const matchesPriority = readyPriority === "ALL" || String(row.priority_label || "").toUpperCase() === readyPriority;
      if (!matchesPriority) {
        return false;
      }

      if (!readySearchText) {
        return true;
      }

      const haystack = [
        row.booking_id,
        row.name,
        row.phone,
        row.scheduleLabel,
        row.status,
        row.priority_label
      ].map((value) => normalizeText(value)).join(" ");

      return haystack.includes(readySearchText);
    });

    const sortedReady = sortWaitingRows(filteredReady, readySort);
    const readyPaginated = paginateRows(sortedReady, readyPage, 20);

    const waitingBaseQuery = {
      view: "waiting",
      wSearch: waitingSearch,
      wPriority: waitingPriority,
      wSort: waitingSort,
      bSearch: bookedSearch,
      bSort: bookedSort,
      rSearch: readySearch,
      rPriority: readyPriority,
      rSort: readySort
    };

    const bookedBaseQuery = {
      view: "booked",
      wSearch: waitingSearch,
      wPriority: waitingPriority,
      wSort: waitingSort,
      bSearch: bookedSearch,
      bSort: bookedSort,
      rSearch: readySearch,
      rPriority: readyPriority,
      rSort: readySort
    };

    const readyBaseQuery = {
      view: "ready",
      wSearch: waitingSearch,
      wPriority: waitingPriority,
      wSort: waitingSort,
      bSearch: bookedSearch,
      bSort: bookedSort,
      rSearch: readySearch,
      rPriority: readyPriority,
      rSort: readySort
    };

    const waitingReturnTo = `/admin/waiting-list?${toQueryString({ ...waitingBaseQuery, wPage: waitingPaginated.meta.currentPage, bPage: bookedPaginated.meta.currentPage, rPage: readyPaginated.meta.currentPage })}`;
    const bookedReturnTo = `/admin/waiting-list?${toQueryString({ ...bookedBaseQuery, wPage: waitingPaginated.meta.currentPage, bPage: bookedPaginated.meta.currentPage, rPage: readyPaginated.meta.currentPage })}`;
    const readyReturnTo = `/admin/waiting-list?${toQueryString({ ...readyBaseQuery, wPage: waitingPaginated.meta.currentPage, bPage: bookedPaginated.meta.currentPage, rPage: readyPaginated.meta.currentPage })}`;

    res.render("admin-waiting-list", {
      title: "Admin Waiting List",
      activeAdminTab: "waiting-list",
      activeView,
      waitingRows: waitingPaginated.rows,
      occupiedRows: bookedPaginated.rows,
      readyRows: readyPaginated.rows,
      waitingMeta: waitingPaginated.meta,
      bookedMeta: bookedPaginated.meta,
      readyMeta: readyPaginated.meta,
      waitingControls: {
        search: waitingSearch,
        priority: waitingPriority,
        sort: waitingSort,
        baseQuery: waitingBaseQuery
      },
      bookedControls: {
        search: bookedSearch,
        sort: bookedSort,
        baseQuery: bookedBaseQuery
      },
      readyControls: {
        search: readySearch,
        priority: readyPriority,
        sort: readySort,
        baseQuery: readyBaseQuery
      },
      waitingReturnTo,
      bookedReturnTo,
      readyReturnTo,
      recommendedSort: "Best default sort: Priority (VIP > Elderly > Standard), then earliest arrival."
    });
  } catch (error) {
    next(error);
  }
}
async function renderAdminMenuPage(req, res, next) {
  try {
    const menuItems = await getAllMenuItems();

    res.render("admin-menu", {
      title: "Admin Menu",
      activeAdminTab: "menu",
      menuItems
    });
  } catch (error) {
    next(error);
  }
}

function resolveReturnTo(req, fallbackPath) {
  const returnTo = req.body.returnTo;
  if (typeof returnTo === "string" && returnTo.startsWith("/admin")) {
    return returnTo;
  }
  return fallbackPath;
}

async function updateAdminTableStatus(req, res, next) {
  try {
    const tableId = Number(req.params.id);
    const { status } = req.body;
    const returnTo = resolveReturnTo(req, "/admin/tables");

    if (status === "AVAILABLE") {
      const resetReadyAt = getResetReadyAtTimestamp(new Date());
      // Retrieve current confirmed booking to mark as completed
      const currentBookings = await getLatestConfirmedBookingsByTableIds([tableId]);
      if (currentBookings.length > 0) {
        await updateBookingStatus(currentBookings[0].id, "COMPLETED");
      }
      await updateTableStatus(tableId, "AVAILABLE");
      await setTableResetReadyAt(tableId, resetReadyAt);
      broadcastUpdate();
      req.session.flash = {
        type: "info",
        text: `Table ${tableId} marked for reset. New customers will appear once reset is done.`
      };
      return res.redirect(returnTo);
    }

    await clearTableResetReadyAt(tableId);
    await updateTableStatus(tableId, "OCCUPIED");
    broadcastUpdate();
    req.session.flash = { type: "warning", text: "Table marked as occupied." };
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}

async function resetDoneAdminTable(req, res, next) {
  try {
    const tableId = Number(req.params.id);
    const returnTo = resolveReturnTo(req, "/admin/tables");

    await clearTableResetReadyAt(tableId);
    await updateTableStatus(tableId, "AVAILABLE");
    const promotedId = await promoteNextWaitingBooking(tableId);

    broadcastUpdate();
    req.session.flash = promotedId
      ? { type: "success", text: `Reset done. Waiting booking #${promotedId} was promoted.` }
      : { type: "success", text: "Reset done. Table is now available." };
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}

async function completeAdminBooking(req, res, next) {
  try {
    const returnTo = resolveReturnTo(req, "/admin/waiting-list");
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      broadcastUpdate();
    req.session.flash = { type: "danger", text: "Booking not found." };
      return res.redirect(returnTo);
    }

    await updateBookingStatus(booking.id, "COMPLETED");

    if (booking.table_id) {
      const resetReadyAt = getResetReadyAtTimestamp(new Date());
      await updateTableStatus(booking.table_id, "AVAILABLE");
      await setTableResetReadyAt(booking.table_id, resetReadyAt);
    }
    broadcastUpdate();
    req.session.flash = { type: "success", text: `Booking #${booking.id} completed. Table is being reset.` };
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}

async function seatNowAdminBooking(req, res, next) {
  try {
    const returnTo = resolveReturnTo(req, "/admin/waiting-list");
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      broadcastUpdate();
    req.session.flash = { type: "danger", text: "Booking not found." };
      return res.redirect(returnTo);
    }

    const seatedAt = new Date();
    // Use the booking's scheduled date+time as the profile reference (not wall-clock now)
    // so lunch/dinner/weekend profiles reflect when the booking was made, not the seating moment.
    const bookingRefTime = (booking.booking_date && booking.booking_time)
      ? new Date(`${booking.booking_date}T${String(booking.booking_time).slice(0, 5)}:00`)
      : seatedAt;
    const durationRef = Number.isNaN(bookingRefTime.getTime()) ? seatedAt : bookingRefTime;
    const duration = getDurationMinutes(durationRef, booking.guests || 2) || AVG_DINING_TIME;
    const expectedEndAt = new Date(seatedAt.getTime() + duration * 60000);

    await markBookingSeated(booking.id, seatedAt, expectedEndAt);
    req.session.flash = { type: "success", text: `Booking #${booking.id} marked seated. ETA end in ~${duration} mins.` };
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}

async function extendAdminBooking(req, res, next) {
  try {
    const returnTo = resolveReturnTo(req, "/admin/waiting-list");
    const booking = await getBookingById(req.params.id);
    if (!booking) {
      broadcastUpdate();
    req.session.flash = { type: "danger", text: "Booking not found." };
      return res.redirect(returnTo);
    }

    await extendBookingExpectedEnd(booking.id, 15);

    let impactedCount = 0;
    if (booking.table_id) {
      const table = await getTableById(booking.table_id);
      if (table && Number(table.capacity) > 0) {
        const impact = await addWaitingMinutesForEtaWindow({ capacity: table.capacity, addMinutes: 15, etaWindowMinutes: 20 });
        impactedCount = impact.impactedTotal || 0;
      }
    }

    broadcastUpdate();
    req.session.flash = {
      type: "info",
      text: `Booking #${booking.id} extended by 15 minutes; updated ${impactedCount} waiting guest(s) in 20-min ETA window.`
    };
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}
async function promoteAdminQueueBooking(req, res, next) {
  try {
    const returnTo = resolveReturnTo(req, "/admin/waiting-list");
    const booking = await getBookingById(req.params.bookingId);

    if (!booking || booking.status !== "WAITING") {
      broadcastUpdate();
    req.session.flash = { type: "danger", text: "Waiting booking not found." };
      return res.redirect(returnTo);
    }

    const candidateTables = await getAvailableTablesByCapacity(booking.guests || 1);

    if (!candidateTables.length) {
      req.session.flash = { type: "warning", text: "No free table is available for this guest size yet." };
      return res.redirect(returnTo);
    }

    const selectedTableId = Number(req.body.table_id);
    const selectedTable = Number.isFinite(selectedTableId) && selectedTableId > 0
      ? candidateTables.find((table) => Number(table.id) === selectedTableId)
      : candidateTables[0];

    if (!selectedTable) {
      req.session.flash = {
        type: "warning",
        text: "Selected table is no longer available. Please try again."
      };
      return res.redirect(returnTo);
    }

    await assignBookingToTable(booking.id, selectedTable.id);
    await clearTableResetReadyAt(selectedTable.id);
    await updateTableStatus(selectedTable.id, "OCCUPIED");
    await removeFromQueue(booking.id);

    const seatedAt = new Date();
    const bookingRefTime2 = (booking.booking_date && booking.booking_time)
      ? new Date(`${booking.booking_date}T${String(booking.booking_time).slice(0, 5)}:00`)
      : seatedAt;
    const durationRef2 = Number.isNaN(bookingRefTime2.getTime()) ? seatedAt : bookingRefTime2;
    const duration = getDurationMinutes(durationRef2, booking.guests || 2) || AVG_DINING_TIME;
    const expectedEndAt = new Date(seatedAt.getTime() + duration * 60000);
    await markBookingSeated(booking.id, seatedAt, expectedEndAt);

    req.session.flash = {
      type: "success",
      text: `Booking #${booking.id} seated at table ${selectedTable.id}.`
    };
    broadcastUpdate();
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}


async function addAdminWaitingTime(req, res, next) {
  try {
    const returnTo = resolveReturnTo(req, "/admin/waiting-list");
    const booking = await getBookingById(req.params.bookingId);

    if (!booking || booking.status !== "WAITING") {
      broadcastUpdate();
    req.session.flash = { type: "danger", text: "Waiting booking not found." };
      return res.redirect(returnTo);
    }

    const minutes = safeNumber(req.body.minutes, 0);
    if (minutes !== 10 && minutes !== 15) {
      req.session.flash = { type: "warning", text: "Only +10 or +15 minute updates are allowed." };
      return res.redirect(returnTo);
    }

    await addWaitingMinutes(booking.id, minutes);
    req.session.flash = { type: "info", text: `Waiting time updated for booking #${booking.id} (+${minutes} min).` };
    broadcastUpdate();
    return res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
}async function createAdminMenuItem(req, res, next) {
  try {
    await createMenuItem({
      name: req.body.name,
      price: Number(req.body.price)
    });
    req.session.flash = { type: "success", text: `${req.body.name} added to the menu.` };
    return res.redirect("/admin/menu");
  } catch (error) {
    next(error);
  }
}

async function toggleAdminMenuItem(req, res, next) {
  try {
    await toggleMenuAvailability(req.params.id);
    req.session.flash = { type: "info", text: "Menu availability updated." };
    return res.redirect("/admin/menu");
  } catch (error) {
    next(error);
  }
}

async function deleteAdminMenuItem(req, res, next) {
  try {
    await deleteMenuItem(req.params.id);
    req.session.flash = { type: "warning", text: "Menu item deleted." };
    return res.redirect("/admin/menu");
  } catch (error) {
    next(error);
  }
}

module.exports = {
  completeAdminBooking,
  createAdminMenuItem,
  deleteAdminMenuItem,
  extendAdminBooking,
  loginAdmin,
  logoutAdmin,
  promoteAdminQueueBooking,
  addAdminWaitingTime,
  redirectAdminRoot,
  renderAdminLogin,
  renderAdminMenuPage,
  renderAdminTablesPage,
  renderAdminWaitingListPage,
  resetDoneAdminTable,
  seatNowAdminBooking,
  toggleAdminMenuItem,
  updateAdminTableStatus
};












