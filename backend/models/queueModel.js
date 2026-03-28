const { query } = require("../config/db");

async function getQueueSize() {
  const result = await query("SELECT COUNT(*)::int AS count FROM waiting_queue");
  return result.rows[0].count;
}

async function addToQueue({ bookingId, priorityLabel, priorityScore }) {
  await query(
    "INSERT INTO waiting_queue (booking_id, priority_label, priority_score) VALUES ($1, $2, $3)",
    [bookingId, priorityLabel, priorityScore]
  );
}

async function removeFromQueue(bookingId) {
  await query("DELETE FROM waiting_queue WHERE booking_id = $1", [bookingId]);
}

async function getQueueList() {
  const result = await query(
    `SELECT w.*, b.name, b.phone, b.guests, b.wait_time_minutes, b.booking_date, b.booking_time, b.status
     FROM waiting_queue w
     JOIN bookings b ON b.id = w.booking_id
     ORDER BY w.priority_score DESC, w.arrival_time ASC`
  );
  return result.rows;
}

async function getNextQueueBookingForCapacity(capacity) {
  const result = await query(
    `SELECT w.booking_id
     FROM waiting_queue w
     JOIN bookings b ON b.id = w.booking_id
     WHERE b.status = 'WAITING' AND b.guests <= $1
     ORDER BY w.priority_score DESC, w.arrival_time ASC
     LIMIT 1`,
    [capacity]
  );
  return result.rows[0] || null;
}

async function getQueueAheadForParty({ partySize, priorityScore }) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM waiting_queue w
     JOIN bookings b ON b.id = w.booking_id
     WHERE b.status = 'WAITING'
       AND b.guests <= $1
       AND (w.priority_score > $2 OR (w.priority_score = $2 AND w.arrival_time < NOW()))`,
    [partySize, priorityScore]
  );
  return result.rows[0].count;
}

async function getQueueSizeByBucket() {
  const result = await query(
    `SELECT
       CASE
         WHEN b.guests <= 2 THEN '1-2'
         WHEN b.guests <= 4 THEN '3-4'
         WHEN b.guests <= 6 THEN '5-6'
         ELSE '7+'
       END AS party_bucket,
       COUNT(*)::int AS count
     FROM waiting_queue w
     JOIN bookings b ON b.id = w.booking_id
     WHERE b.status = 'WAITING'
     GROUP BY party_bucket`
  );
  return result.rows;
}

module.exports = {
  addToQueue,
  getNextQueueBookingForCapacity,
  getQueueAheadForParty,
  getQueueList,
  getQueueSize,
  getQueueSizeByBucket,
  removeFromQueue
};

