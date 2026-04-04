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
     ORDER BY 
       (CASE WHEN (b.booking_date + b.booking_time::interval + (COALESCE(b.wait_time_minutes, 0) || ' minutes')::interval) <= NOW() THEN 0 ELSE 1 END) ASC,
       w.priority_score DESC,
       (b.booking_date + b.booking_time::interval + (COALESCE(b.wait_time_minutes, 0) || ' minutes')::interval) ASC`
  );
  return result.rows;
}

function getGuestRange(capacity) {
  const c = Number(capacity) || 2;
  if (c <= 2) return { minGuests: 1, maxGuests: 2 };
  if (c <= 4) return { minGuests: 1, maxGuests: 4 };
  if (c <= 6) return { minGuests: 3, maxGuests: 6 };
  if (c <= 8) return { minGuests: 5, maxGuests: 8 };
  return { minGuests: c - 3, maxGuests: c };
}

async function getNextQueueBookingForCapacity(capacity) {
  const { minGuests, maxGuests } = getGuestRange(capacity);
  const result = await query(
    `SELECT w.booking_id, b.name, b.guests
     FROM waiting_queue w
     JOIN bookings b ON b.id = w.booking_id
     WHERE b.status = 'WAITING' AND b.guests >= $1 AND b.guests <= $2
     ORDER BY 
       (CASE WHEN (b.booking_date + b.booking_time::interval + (COALESCE(b.wait_time_minutes, 0) || ' minutes')::interval) <= NOW() THEN 0 ELSE 1 END) ASC,
       w.priority_score DESC,
       (b.booking_date + b.booking_time::interval + (COALESCE(b.wait_time_minutes, 0) || ' minutes')::interval) ASC
     LIMIT 1`,
    [minGuests, maxGuests]
  );
  return result.rows[0] || null;
}

function getCapacityRange(guests) {
  const g = Number(guests) || 1;
  let minCap = 2;
  if (g > 6) minCap = 8;
  else if (g > 4) minCap = 6;
  else if (g > 2) minCap = 4;
  
  let maxCap = minCap;
  if (minCap < 8) maxCap = minCap + 2;
  
  if (g > 8) {
    minCap = g;
    maxCap = g;
  }
  
  return { minCap, maxCap };
}

async function getQueueAheadForParty({ partySize, priorityScore }) {
  const { minCap, maxCap } = getCapacityRange(partySize);
  // We want to count people ahead of us who might take the tables WE want.
  // Anyone whose maxGuests allows them to sit at our minCap...maxCap could take our table.
  // A simple approximation: if their maxCap >= our minCap AND their minCap <= our maxCap
  // Wait, let's just make it 'anyone ahead of us' for the time being, or keep b.guests <= maxCap.
  // Let's use maxCap for overlap estimation: b.guests <= maxCap is a decent proxy.
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM waiting_queue w
     JOIN bookings b ON b.id = w.booking_id
     WHERE b.status = 'WAITING'
       AND b.guests <= $1
       AND (w.priority_score > $2 OR (w.priority_score = $2 AND w.arrival_time < NOW()))`,
    [maxCap, priorityScore]
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

