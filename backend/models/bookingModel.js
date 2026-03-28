const { query } = require("../config/db");
const { hasColumns } = require("./schemaSupport");

async function createConfirmedBooking({ name, phone, bookingDate, bookingTime, guests, tableId, predictedWaitMinutes = 0 }) {
  const supportsPrediction = await hasColumns("bookings", ["predicted_wait_minutes"]);

  const result = supportsPrediction
    ? await query(
      `INSERT INTO bookings (name, phone, booking_date, booking_time, guests, status, table_id, wait_time_minutes, predicted_wait_minutes)
       VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6, 0, $7)
       RETURNING id`,
      [name, phone, bookingDate, bookingTime, guests, tableId, predictedWaitMinutes]
    )
    : await query(
      `INSERT INTO bookings (name, phone, booking_date, booking_time, guests, status, table_id, wait_time_minutes)
       VALUES ($1, $2, $3, $4, $5, 'CONFIRMED', $6, 0)
       RETURNING id`,
      [name, phone, bookingDate, bookingTime, guests, tableId]
    );

  return result.rows[0];
}

async function createWaitingBooking({ name, phone, bookingDate, bookingTime, guests, waitTimeMinutes, predictedWaitMinutes = null }) {
  const supportsPrediction = await hasColumns("bookings", ["predicted_wait_minutes"]);

  const result = supportsPrediction
    ? await query(
      `INSERT INTO bookings (name, phone, booking_date, booking_time, guests, status, wait_time_minutes, predicted_wait_minutes)
       VALUES ($1, $2, $3, $4, $5, 'WAITING', $6, $7)
       RETURNING id`,
      [name, phone, bookingDate, bookingTime, guests, waitTimeMinutes, predictedWaitMinutes]
    )
    : await query(
      `INSERT INTO bookings (name, phone, booking_date, booking_time, guests, status, wait_time_minutes)
       VALUES ($1, $2, $3, $4, $5, 'WAITING', $6)
       RETURNING id`,
      [name, phone, bookingDate, bookingTime, guests, waitTimeMinutes]
    );

  return result.rows[0];
}

async function getBookingById(bookingId) {
  const result = await query("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  return result.rows[0] || null;
}

async function getBookingWithAssignedTable(bookingId) {
  const result = await query(
    `SELECT b.*, t.id AS assigned_table
     FROM bookings b
     LEFT JOIN tables t ON t.id = b.table_id
     WHERE b.id = $1
     LIMIT 1`,
    [bookingId]
  );
  return result.rows[0] || null;
}

async function getLatestBookingByPhone(phone) {
  const result = await query(
    `SELECT b.*, t.id AS assigned_table
     FROM bookings b
     LEFT JOIN tables t ON t.id = b.table_id
     WHERE b.phone = $1
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [phone]
  );
  return result.rows[0] || null;
}

async function getAllBookings() {
  const result = await query("SELECT * FROM bookings ORDER BY created_at DESC");
  return result.rows;
}

async function getActiveOccupancyByTableIds(tableIds = []) {
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return [];
  }

  const supportsAdvanced = await hasColumns("bookings", [
    "seated_at",
    "expected_end_at",
    "predicted_wait_minutes",
    "actual_wait_minutes",
    "prediction_error"
  ]);

  const selectClause = supportsAdvanced
    ? `table_id,
       booking_date,
       booking_time,
       guests,
       created_at,
       seated_at,
       expected_end_at,
       predicted_wait_minutes,
       actual_wait_minutes,
       prediction_error`
    : `table_id,
       booking_date,
       booking_time,
       guests,
       created_at,
       NULL::timestamp AS seated_at,
       NULL::timestamp AS expected_end_at,
       NULL::int AS predicted_wait_minutes,
       NULL::int AS actual_wait_minutes,
       NULL::int AS prediction_error`;

  const result = await query(
    `SELECT DISTINCT ON (table_id)
       ${selectClause}
     FROM bookings
     WHERE status = 'CONFIRMED'
       AND table_id = ANY($1::int[])
     ORDER BY table_id, created_at DESC`,
    [tableIds]
  );

  return result.rows;
}

async function updateBookingStatus(bookingId, status) {
  await query("UPDATE bookings SET status = $1 WHERE id = $2", [status, bookingId]);
}

async function assignBookingToTable(bookingId, tableId) {
  await query(
    "UPDATE bookings SET status = 'CONFIRMED', table_id = $1, wait_time_minutes = 0 WHERE id = $2",
    [tableId, bookingId]
  );
}

async function markBookingSeated(bookingId, seatedAt, expectedEndAt) {
  const supportsAdvanced = await hasColumns("bookings", [
    "seated_at",
    "expected_end_at",
    "actual_wait_minutes",
    "prediction_error",
    "predicted_wait_minutes"
  ]);

  if (!supportsAdvanced) {
    return;
  }

  await query(
    `UPDATE bookings
     SET seated_at = $1,
         expected_end_at = $2,
         actual_wait_minutes = GREATEST(0, EXTRACT(EPOCH FROM ($1 - (booking_date + booking_time)))::int / 60),
         prediction_error = CASE WHEN predicted_wait_minutes IS NULL THEN NULL
                                 ELSE (GREATEST(0, EXTRACT(EPOCH FROM ($1 - (booking_date + booking_time)))::int / 60) - predicted_wait_minutes)
                            END
     WHERE id = $3`,
    [seatedAt, expectedEndAt, bookingId]
  );
}

async function extendBookingExpectedEnd(bookingId, minutes) {
  const supportsExpectedEnd = await hasColumns("bookings", ["expected_end_at"]);
  if (!supportsExpectedEnd) {
    return;
  }

  await query(
    `UPDATE bookings
     SET expected_end_at = COALESCE(expected_end_at, NOW()) + ($1 || ' minutes')::interval
     WHERE id = $2`,
    [minutes, bookingId]
  );
}

async function markBookingNoShow(bookingId) {
  const supportsNoShow = await hasColumns("bookings", ["no_show_at"]);

  if (!supportsNoShow) {
    await query("UPDATE bookings SET status = 'CANCELLED' WHERE id = $1", [bookingId]);
    return;
  }

  await query(
    `UPDATE bookings
     SET status = 'CANCELLED',
         no_show_at = NOW()
     WHERE id = $1`,
    [bookingId]
  );
}

async function getNoShowCandidates(graceMinutes) {
  const supportsNoShowFlow = await hasColumns("bookings", ["seated_at", "no_show_at"]);
  if (!supportsNoShowFlow) {
    return [];
  }

  const result = await query(
    `SELECT id, table_id
     FROM bookings
     WHERE status = 'CONFIRMED'
       AND table_id IS NOT NULL
       AND seated_at IS NULL
       AND no_show_at IS NULL
       AND (booking_date + booking_time + ($1 || ' minutes')::interval) < NOW()`,
    [graceMinutes]
  );
  return result.rows;
}


async function addWaitingMinutes(bookingId, minutes) {
  const supportsPrediction = await hasColumns("bookings", ["predicted_wait_minutes"]);

  if (supportsPrediction) {
    await query(
      `UPDATE bookings
       SET wait_time_minutes = COALESCE(wait_time_minutes, 0) + $1,
           predicted_wait_minutes = CASE
             WHEN predicted_wait_minutes IS NULL THEN NULL
             ELSE predicted_wait_minutes + $1
           END
       WHERE id = $2 AND status = 'WAITING'`,
      [minutes, bookingId]
    );
    return;
  }

  await query(
    `UPDATE bookings
     SET wait_time_minutes = COALESCE(wait_time_minutes, 0) + $1
     WHERE id = $2 AND status = 'WAITING'`,
    [minutes, bookingId]
  );
}

async function addWaitingMinutesForCapacityPath(capacity, minutes) {
  const safeCapacity = Number(capacity);
  const safeMinutes = Number(minutes);

  if (!Number.isFinite(safeCapacity) || safeCapacity <= 0 || !Number.isFinite(safeMinutes) || safeMinutes <= 0) {
    return 0;
  }

  const supportsPrediction = await hasColumns("bookings", ["predicted_wait_minutes"]);

  if (supportsPrediction) {
    const advancedResult = await query(
      `WITH affected AS (
         SELECT b.id
         FROM waiting_queue w
         JOIN bookings b ON b.id = w.booking_id
         WHERE b.status = 'WAITING'
           AND b.guests <= $1
         ORDER BY w.priority_score DESC, w.arrival_time ASC
       )
       UPDATE bookings b
       SET wait_time_minutes = COALESCE(b.wait_time_minutes, 0) + $2,
           predicted_wait_minutes = CASE
             WHEN b.predicted_wait_minutes IS NULL THEN NULL
             ELSE b.predicted_wait_minutes + $2
           END
       FROM affected
       WHERE b.id = affected.id
       RETURNING b.id`,
      [safeCapacity, safeMinutes]
    );

    return advancedResult.rowCount || 0;
  }

  const basicResult = await query(
    `WITH affected AS (
       SELECT b.id
       FROM waiting_queue w
       JOIN bookings b ON b.id = w.booking_id
       WHERE b.status = 'WAITING'
         AND b.guests <= $1
       ORDER BY w.priority_score DESC, w.arrival_time ASC
     )
     UPDATE bookings b
     SET wait_time_minutes = COALESCE(b.wait_time_minutes, 0) + $2
     FROM affected
     WHERE b.id = affected.id
     RETURNING b.id`,
    [safeCapacity, safeMinutes]
  );

  return basicResult.rowCount || 0;
}
async function getLatestConfirmedBookingsByTableIds(tableIds = []) {
  if (!Array.isArray(tableIds) || tableIds.length === 0) {
    return [];
  }

  const supportsAdvanced = await hasColumns("bookings", ["seated_at", "expected_end_at"]);

  const advancedFields = supportsAdvanced
    ? `b.seated_at,
       b.expected_end_at`
    : `NULL::timestamp AS seated_at,
       NULL::timestamp AS expected_end_at`;

  const result = await query(
    `SELECT DISTINCT ON (b.table_id)
       b.id,
       b.table_id,
       b.name,
       b.phone,
       b.guests,
       b.booking_date,
       b.booking_time,
       ${advancedFields},
       b.created_at,
       t.capacity AS table_capacity
     FROM bookings b
     JOIN tables t ON t.id = b.table_id
     WHERE b.status = 'CONFIRMED'
       AND b.table_id = ANY($1::int[])
     ORDER BY b.table_id, b.created_at DESC`,
    [tableIds]
  );

  return result.rows;
}
module.exports = {
  addWaitingMinutes,
  addWaitingMinutesForCapacityPath,
  assignBookingToTable,
  createConfirmedBooking,
  createWaitingBooking,
  extendBookingExpectedEnd,
  getActiveOccupancyByTableIds,
  getAllBookings,
  getBookingById,
  getBookingWithAssignedTable,
  getLatestBookingByPhone,
  getLatestConfirmedBookingsByTableIds,
  getNoShowCandidates,
  markBookingNoShow,
  markBookingSeated,
  updateBookingStatus
};






