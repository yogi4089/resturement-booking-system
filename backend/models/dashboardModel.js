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

async function getInsightData() {
  const [hourVolume, dayVolume, bucketWait, turnover, summary] = await Promise.all([
    // All 24 hour slots for the volume chart (filled with 0 for missing hours)
    query(
      `SELECT
         gs.hour_slot,
         COALESCE(b.total_bookings, 0) AS total_bookings,
         COALESCE(b.avg_wait, 0) AS avg_wait
       FROM generate_series(0, 23) AS gs(hour_slot)
       LEFT JOIN (
         SELECT EXTRACT(HOUR FROM booking_time)::int AS h,
                COUNT(*)::int AS total_bookings,
                COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait
         FROM bookings WHERE status <> 'CANCELLED'
         GROUP BY h
       ) b ON b.h = gs.hour_slot
       ORDER BY gs.hour_slot ASC`
    ),
    // All 7 days
    query(
      `SELECT
         gs.dow,
         CASE gs.dow WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue'
           WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat'
         END AS day_name,
         COALESCE(b.total_bookings, 0) AS total_bookings,
         COALESCE(b.avg_wait, 0) AS avg_wait
       FROM generate_series(0, 6) AS gs(dow)
       LEFT JOIN (
         SELECT EXTRACT(DOW FROM booking_date)::int AS d,
                COUNT(*)::int AS total_bookings,
                COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait
         FROM bookings WHERE status <> 'CANCELLED'
         GROUP BY d
       ) b ON b.d = gs.dow
       ORDER BY gs.dow ASC`
    ),
    // Wait by demand bucket for doughnut
    query(
      `SELECT
         CASE
           WHEN EXTRACT(DOW FROM booking_date)::int BETWEEN 1 AND 5 AND EXTRACT(HOUR FROM booking_time)::int BETWEEN 19 AND 22 THEN 'Weekday Night'
           WHEN EXTRACT(DOW FROM booking_date)::int = 6 AND EXTRACT(HOUR FROM booking_time)::int BETWEEN 19 AND 22 THEN 'Sat Night'
           WHEN EXTRACT(DOW FROM booking_date)::int = 0 AND EXTRACT(HOUR FROM booking_time)::int BETWEEN 19 AND 22 THEN 'Sun Night'
           WHEN EXTRACT(HOUR FROM booking_time)::int BETWEEN 11 AND 15 THEN 'Lunch'
           ELSE 'Off-Peak'
         END AS bucket,
         COUNT(*)::int AS total_bookings,
         COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait
       FROM bookings WHERE status <> 'CANCELLED'
       GROUP BY bucket ORDER BY total_bookings DESC`
    ),
    // Turnover: predicted vs actual seated duration
    query(
      `SELECT
         COALESCE(ROUND(AVG(predicted_wait_minutes))::int, 0) AS avg_predicted,
         COALESCE(ROUND(AVG(actual_wait_minutes))::int, 0) AS avg_actual,
         COALESCE(ROUND(AVG(CASE WHEN seated_at IS NOT NULL AND expected_end_at IS NOT NULL
           THEN EXTRACT(EPOCH FROM (expected_end_at - seated_at)) / 60 END))::int, 0) AS avg_seated_duration
       FROM bookings WHERE status IN ('CONFIRMED', 'COMPLETED')`
    ),
    // Summary stats
    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed_count,
         COUNT(*) FILTER (WHERE status = 'WAITING') AS waiting_count,
         COALESCE(ROUND(AVG(wait_time_minutes))::int, 0) AS avg_wait_time
       FROM bookings`
    )
  ]);

  const currentProfile = getWaitProfileForDateTime(new Date());

  return {
    hourVolume: hourVolume.rows,
    dayVolume: dayVolume.rows,
    bucketWait: bucketWait.rows,
    turnover: turnover.rows[0],
    summary: {
      ...summary.rows[0],
      current_wait_profile: currentProfile.label,
      current_profile_multiplier: currentProfile.multiplier
    }
  };
}

// Used by the overdue-table alert daemon in server.js
async function getOverdueTables() {
  const result = await query(
    `SELECT b.table_id, b.name, b.guests,
            ROUND(EXTRACT(EPOCH FROM (NOW() - b.expected_end_at)) / 60)::int AS overdue_minutes
     FROM bookings b
     WHERE b.status = 'CONFIRMED'
       AND b.expected_end_at IS NOT NULL
       AND b.expected_end_at < NOW() - INTERVAL '5 minutes'`
  );
  return result.rows;
}

module.exports = {
  getDashboardData,
  getInsightData,
  getOverdueTables
};

