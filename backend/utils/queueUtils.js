const {
  AVG_DINING_TIME,
  DURATION_PROFILES,
  GRACE_WINDOW_MINUTES,
  NIGHT_END_HOUR,
  NIGHT_START_HOUR,
  PRIORITY_MAP,
  RESET_BUFFER_MINUTES,
  WAIT_PROFILES
} = require("../config/constants");
const {
  getNextQueueBookingForCapacity,
  getQueueAheadForParty,
  getQueueSize,
  removeFromQueue
} = require("../models/queueModel");
const {
  assignBookingToTable,
  getActiveOccupancyByTableIds,
  getNoShowCandidates,
  markBookingNoShow
} = require("../models/bookingModel");
const {
  clearTableResetReadyAt,
  getEligibleTablesByCapacity,
  getTableById,
  getTableCounts,
  setTableResetReadyAt,
  updateTableStatus
} = require("../models/tableModel");

function isNightHour(hour) {
  return hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;
}

function getWaitProfileForDateTime(targetDateTime = new Date()) {
  const hour = targetDateTime.getHours();
  const day = targetDateTime.getDay();

  if (day >= 1 && day <= 5 && !isNightHour(hour)) {
    return WAIT_PROFILES.LOW;
  }

  if (day >= 1 && day <= 5 && isNightHour(hour)) {
    return WAIT_PROFILES.MEDIUM;
  }

  if (day === 6 && isNightHour(hour)) {
    return WAIT_PROFILES.HIGH;
  }

  if (day === 0 && isNightHour(hour)) {
    return WAIT_PROFILES.HIGHEST;
  }

  return WAIT_PROFILES.LOW;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalBookingDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatFormLikeDate(date) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

function formatFormLikeTime(date) {
  return date
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    })
    .toUpperCase();
}

function getPartyBucket(partySize) {
  if (partySize <= 2) return "1-2";
  if (partySize <= 4) return "3-4";
  if (partySize <= 6) return "5-6";
  return "7+";
}

function getDurationMinutes(targetDateTime, partySize = 2) {
  const hour = targetDateTime.getHours();
  const day = targetDateTime.getDay();
  const bucket = getPartyBucket(partySize);

  if (isNightHour(hour) && (day === 0 || day === 6)) {
    return bucket === "7+" ? DURATION_PROFILES.WEEKEND_DINNER + 20 : DURATION_PROFILES.WEEKEND_DINNER;
  }

  if (isNightHour(hour)) {
    return bucket === "7+" ? DURATION_PROFILES.DINNER + 15 : DURATION_PROFILES.DINNER;
  }

  if (hour >= 11 && hour <= 15) {
    return bucket === "7+" ? DURATION_PROFILES.LUNCH + 15 : DURATION_PROFILES.LUNCH;
  }

  return DURATION_PROFILES.DEFAULT || AVG_DINING_TIME;
}

function toBookingDateTime(bookingDate, bookingTime, fallback = new Date()) {
  if (!bookingDate || !bookingTime) {
    return fallback;
  }

  const dateTime = new Date(`${bookingDate}T${String(bookingTime).slice(0, 5)}:00`);
  if (Number.isNaN(dateTime.getTime())) {
    return fallback;
  }

  return dateTime;
}

async function releaseNoShowBookings() {
  const candidates = await getNoShowCandidates(GRACE_WINDOW_MINUTES);

  for (const candidate of candidates) {
    await markBookingNoShow(candidate.id);
    if (candidate.table_id) {
      await clearTableResetReadyAt(candidate.table_id);
      await updateTableStatus(candidate.table_id, "AVAILABLE");
    }
  }

  return candidates.length;
}

function computeTableFreeAt(table, occupancyByTable, anchorTime, durationMinutes) {
  const occupancy = occupancyByTable.get(Number(table.id));

  if (table.status === "AVAILABLE") {
    if (table.reset_ready_at && new Date(table.reset_ready_at) > anchorTime) {
      return new Date(table.reset_ready_at);
    }
    return new Date(anchorTime);
  }

  if (!occupancy) {
    return new Date(anchorTime.getTime() + durationMinutes * 60000);
  }

  if (occupancy.expected_end_at) {
    const expectedEnd = new Date(occupancy.expected_end_at);
    return expectedEnd > anchorTime ? expectedEnd : new Date(anchorTime);
  }

  const bookingStart = toBookingDateTime(occupancy.booking_date, occupancy.booking_time, anchorTime);
  const effectiveStart = bookingStart > anchorTime ? bookingStart : anchorTime;
  return new Date(effectiveStart.getTime() + durationMinutes * 60000);
}

async function buildWaitEstimate(options = {}) {
  await releaseNoShowBookings();

  const targetDateTime = options.targetDateTime || new Date();
  const partySize = Number(options.partySize || 0);
  const priorityLabel = options.priorityLabel || "STANDARD";

  const waitProfile = getWaitProfileForDateTime(targetDateTime);
  const priorityScore = PRIORITY_MAP[priorityLabel] || PRIORITY_MAP.STANDARD;

  if (!partySize) {
    const [{ occupiedTables, totalTables }, queueCount] = await Promise.all([
      getTableCounts(),
      getQueueSize()
    ]);

    const safeTotalTables = Math.max(totalTables, 1);
    const baseTableDelay = (occupiedTables * AVG_DINING_TIME) / safeTotalTables;
    const baseQueueDelay = queueCount * 15;
    const queueDelay = baseQueueDelay * waitProfile.multiplier;
    const waitTime = Math.ceil(baseTableDelay + queueDelay);

    return {
      waitTime,
      waitRange: {
        min: Math.max(0, waitTime - 10),
        max: waitTime + 15
      },
      nextSlot: new Date(targetDateTime.getTime() + waitTime * 60000),
      earliestEligibleSlot: new Date(targetDateTime.getTime() + waitTime * 60000),
      waitProfile: waitProfile.label,
      multiplier: waitProfile.multiplier,
      durationUsed: AVG_DINING_TIME,
      components: {
        occupiedTables,
        totalTables: safeTotalTables,
        queueCount,
        baseTableDelay: Math.ceil(baseTableDelay),
        baseQueueDelay,
        adjustedQueueDelay: Math.ceil(queueDelay),
        eligibleTableCount: safeTotalTables,
        queueAhead: queueCount
      }
    };
  }

  const [eligibleTables, queueAhead] = await Promise.all([
    getEligibleTablesByCapacity(partySize),
    getQueueAheadForParty({ partySize, priorityScore })
  ]);

  const eligibleTableCount = Math.max(eligibleTables.length, 1);
  const occupancyRows = await getActiveOccupancyByTableIds(eligibleTables.map((table) => table.id));
  const occupancyByTable = new Map(occupancyRows.map((row) => [Number(row.table_id), row]));

  const durationUsed = getDurationMinutes(targetDateTime, partySize);
  const freeTimes = eligibleTables.map((table) => computeTableFreeAt(table, occupancyByTable, targetDateTime, durationUsed));

  const earliestFree = freeTimes.length
    ? new Date(Math.min(...freeTimes.map((slot) => slot.getTime())))
    : new Date(targetDateTime.getTime() + durationUsed * 60000);

  const queueCycles = Math.floor(queueAhead / eligibleTableCount);
  const additionalFromQueue = queueCycles * durationUsed;
  const queueAdjustedSlot = new Date(earliestFree.getTime() + additionalFromQueue * 60000);

  const rawMinutes = Math.max(0, Math.ceil((queueAdjustedSlot.getTime() - targetDateTime.getTime()) / 60000));
  const adjustedMinutes = Math.ceil(rawMinutes * waitProfile.multiplier);
  const buffer = Math.max(10, Math.ceil(adjustedMinutes * 0.2));

  return {
    waitTime: adjustedMinutes,
    waitRange: {
      min: Math.max(0, adjustedMinutes - buffer),
      max: adjustedMinutes + buffer
    },
    nextSlot: new Date(targetDateTime.getTime() + adjustedMinutes * 60000),
    earliestEligibleSlot: queueAdjustedSlot,
    waitProfile: waitProfile.label,
    multiplier: waitProfile.multiplier,
    durationUsed,
    components: {
      eligibleTableCount,
      queueAhead,
      queueCount: queueAhead,
      partyBucket: getPartyBucket(partySize),
      baseTableDelay: Math.ceil(Math.max(0, (earliestFree.getTime() - targetDateTime.getTime()) / 60000)),
      baseQueueDelay: additionalFromQueue,
      adjustedQueueDelay: Math.ceil(additionalFromQueue * waitProfile.multiplier)
    }
  };
}

async function promoteNextWaitingBooking(tableId) {
  const table = await getTableById(tableId);
  if (!table) {
    return null;
  }

  const queueItem = await getNextQueueBookingForCapacity(table.capacity);
  if (!queueItem) {
    return null;
  }

  await assignBookingToTable(queueItem.booking_id, tableId);
  await clearTableResetReadyAt(tableId);
  await updateTableStatus(tableId, "OCCUPIED");
  await removeFromQueue(queueItem.booking_id);

  return queueItem.booking_id;
}

function buildAlternativeSlots(waitEstimate, count = 4) {
  const base = waitEstimate.earliestEligibleSlot || waitEstimate.nextSlot;
  const slotList = [];

  for (let index = 0; index < count; index += 1) {
    const slotDate = new Date(base.getTime() + index * 30 * 60000);
    const weekday = slotDate.toLocaleDateString("en-IN", { weekday: "long" });
    const weekdayShort = slotDate.toLocaleDateString("en-IN", { weekday: "short" });

    slotList.push({
      bookingDate: formatLocalBookingDate(slotDate),
      bookingTime: `${pad2(slotDate.getHours())}:${pad2(slotDate.getMinutes())}`,
      formattedDate: formatFormLikeDate(slotDate),
      formattedTime: formatFormLikeTime(slotDate),
      weekday,
      weekdayShort
    });
  }

  return slotList;
}

function getResetReadyAtTimestamp(fromDate = new Date()) {
  return new Date(fromDate.getTime() + RESET_BUFFER_MINUTES * 60000);
}

module.exports = {
  buildAlternativeSlots,
  buildWaitEstimate,
  getDurationMinutes,
  getResetReadyAtTimestamp,
  getWaitProfileForDateTime,
  promoteNextWaitingBooking,
  releaseNoShowBookings
};

