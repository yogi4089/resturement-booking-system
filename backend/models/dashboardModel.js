const { query } = require("../config/db");
const { getAllMenuItems } = require("./menuModel");
const { getTableInventory } = require("./tableModel");
const { hasColumns } = require("./schemaSupport");
const { getWaitProfileForDateTime } = require("../utils/queueUtils");

async function getTelemetrySnapshot() {
  const supportsTelemetry = await hasColumns("bookings", ["prediction_error", "actual_wait_minutes", "no_show_at"]);

  if (!supportsTelemetry) {
    return {
      mae: 0,
      mape: 0,
      no_show_rate: 0,
      promotion_delay: 0
    };
  }

  const result = await query(
    `SELECT
       COALESCE(ROUND(AVG(ABS(prediction_error)))::int, 0) AS mae,
       COALESCE(ROUND(AVG(CASE WHEN actual_wait_minutes > 0 THEN ABS(prediction_error)::numeric / actual_wait_minutes * 100 END))::int, 0) AS mape,
       COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE no_show_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2), 0)::float AS no_show_rate,
       COALESCE(ROUND(AVG(actual_wait_minutes))::int, 0) AS promotion_delay
     FROM bookings`
  );

  return result.rows[0];
}

async function getDashboardData() {
  const [tables, bookings, queue, menuItems, analytics, busyHours, popularDays, waitByBucket, telemetry] = await Promise.all([
    getTableInventory(),
    query(
      `SELECT b.*, t.capacity AS table_capacity
       FROM bookings b
       LEFT JOIN tables t ON t.id = b.table_id
       ORDER BY b.booking_date ASC, b.booking_time ASC, b.created_at DESC`
    ),
    query(
      `SELECT w.*, b.name, b.phone, b.guests, b.booking_date, b.booking_time, b.status
       FROM waiting_queue w
       JOIN bookings b ON b.id = w.booking_id
       ORDER BY w.priority_score DESC, w.arrival_time ASC`
    ),
    getAllMenuItems(),
    query(
      `SELECT
         COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait_time,
         COALESCE(MAX(wait_time_minutes), 0) AS peak_wait_time,
         COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_count,
         COUNT(*) FILTER (WHERE status = 'WAITING') AS waiting_count
       FROM bookings`
    ),
    query(
      `SELECT
         EXTRACT(HOUR FROM booking_time)::int AS hour_slot,
         COUNT(*)::int AS total_bookings,
         COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait_time
       FROM bookings
       WHERE status <> 'CANCELLED'
       GROUP BY hour_slot
       ORDER BY total_bookings DESC, hour_slot ASC
       LIMIT 5`
    ),
    query(
      `SELECT
         EXTRACT(DOW FROM booking_date)::int AS dow,
         CASE EXTRACT(DOW FROM booking_date)::int
           WHEN 0 THEN 'Sunday'
           WHEN 1 THEN 'Monday'
           WHEN 2 THEN 'Tuesday'
           WHEN 3 THEN 'Wednesday'
           WHEN 4 THEN 'Thursday'
           WHEN 5 THEN 'Friday'
           WHEN 6 THEN 'Saturday'
         END AS day_name,
         COUNT(*)::int AS total_bookings,
         COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait_time
       FROM bookings
       WHERE status <> 'CANCELLED'
       GROUP BY dow
       ORDER BY total_bookings DESC, dow ASC`
    ),
    query(
      `SELECT
         CASE
           WHEN EXTRACT(DOW FROM booking_date)::int BETWEEN 1 AND 5 AND EXTRACT(HOUR FROM booking_time)::int >= 19 AND EXTRACT(HOUR FROM booking_time)::int < 23 THEN 'Weekday Night'
           WHEN EXTRACT(DOW FROM booking_date)::int = 6 AND EXTRACT(HOUR FROM booking_time)::int >= 19 AND EXTRACT(HOUR FROM booking_time)::int < 23 THEN 'Saturday Night'
           WHEN EXTRACT(DOW FROM booking_date)::int = 0 AND EXTRACT(HOUR FROM booking_time)::int >= 19 AND EXTRACT(HOUR FROM booking_time)::int < 23 THEN 'Sunday Night'
           WHEN EXTRACT(DOW FROM booking_date)::int BETWEEN 1 AND 5 THEN 'Weekday Day'
           ELSE 'Other'
         END AS demand_bucket,
         COUNT(*)::int AS total_bookings,
         COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait_time
       FROM bookings
       WHERE status <> 'CANCELLED'
       GROUP BY demand_bucket
       ORDER BY total_bookings DESC`
    ),
    getTelemetrySnapshot()
  ]);

  const currentProfile = getWaitProfileForDateTime(new Date());

  return {
    tables,
    bookings: bookings.rows,
    queue: queue.rows,
    menuItems,
    analytics: {
      ...analytics.rows[0],
      current_wait_profile: currentProfile.label,
      current_profile_multiplier: currentProfile.multiplier
    },
    telemetry,
    demandInsights: {
      busyHours: busyHours.rows,
      popularDays: popularDays.rows,
      waitByBucket: waitByBucket.rows
    }
  };
}

module.exports = {
  getDashboardData
};
