BEGIN;

-- Keep table count unchanged. This seed only updates booking/queue data.
-- Expected baseline from schema.sql: 6 tables (ids 1..6).

-- 1) Clear runtime booking/queue data
DELETE FROM waiting_queue;
DELETE FROM bookings;

-- 2) Reset first 6 tables to controlled state (5 occupied, 1 available with cleaning)
UPDATE tables
SET status = 'AVAILABLE',
    reset_ready_at = NULL
WHERE id BETWEEN 1 AND 6;

UPDATE tables
SET status = 'OCCUPIED'
WHERE id IN (1, 2, 3, 4, 5);

UPDATE tables
SET reset_ready_at = NOW() + INTERVAL '10 minute'
WHERE id = 6;

-- 3) Insert confirmed bookings with clear customer naming
INSERT INTO bookings (
  name,
  phone,
  booking_date,
  booking_time,
  guests,
  status,
  table_id,
  wait_time_minutes,
  seated_at,
  expected_end_at,
  no_show_at,
  predicted_wait_minutes,
  actual_wait_minutes,
  prediction_error,
  created_at
)
VALUES
  ('Customer 1', '9000000001', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '60 minute')::time, 2, 'CONFIRMED', 1, 0, NOW() - INTERVAL '70 min', NOW() + INTERVAL '10 min', NULL, 0, 0, 0, NOW() - INTERVAL '75 min'),
  ('Customer 2', '9000000002', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '45 minute')::time, 2, 'CONFIRMED', 2, 0, NOW() - INTERVAL '60 min', NOW() + INTERVAL '20 min', NULL, 0, 0, 0, NOW() - INTERVAL '65 min'),
  ('Customer 3', '9000000003', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '30 minute')::time, 4, 'CONFIRMED', 3, 0, NOW() - INTERVAL '55 min', NOW() + INTERVAL '30 min', NULL, 0, 0, 0, NOW() - INTERVAL '60 min'),
  ('Customer 4', '9000000004', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '15 minute')::time, 4, 'CONFIRMED', 4, 0, NOW() - INTERVAL '45 min', NOW() + INTERVAL '35 min', NULL, 0, 0, 0, NOW() - INTERVAL '50 min'),
  ('Customer Overdue', '9000000011', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '2 hour')::time, 6, 'CONFIRMED', 5, 0, NOW() - INTERVAL '2 hour', NOW() - INTERVAL '30 min', NULL, 0, 0, 0, NOW() - INTERVAL '2 hour 15 min'),

  -- cancelled & no-shows
  ('Customer Cancelled', '9000000012', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '30 minute')::time, 2, 'CANCELLED', NULL, 0, NULL, NULL, NULL, 0, 0, 0, NOW() - INTERVAL '1 hour'),
  ('Customer No-Show', '9000000013', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '45 minute')::time, 2, 'CANCELLED', NULL, 0, NULL, NULL, NOW() - INTERVAL '10 min', 0, 0, 0, NOW() - INTERVAL '2 hour'),

  -- historical rows
  ('Customer 5', '9100000001', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '8 hour')::time, 2, 'COMPLETED', 1, 0, NOW() - INTERVAL '8 hour', NOW() - INTERVAL '7 hour', NULL, 10, 8, -2, NOW() - INTERVAL '8 hour 10 min'),
  ('Customer 6', '9100000002', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '6 hour 30 minute')::time, 2, 'COMPLETED', 2, 0, NOW() - INTERVAL '7 hour', NOW() - INTERVAL '6 hour', NULL, 12, 14, 2, NOW() - INTERVAL '7 hour 10 min'),
  ('Customer 7', '9100000003', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '5 hour')::time, 4, 'COMPLETED', 3, 0, NOW() - INTERVAL '6 hour', NOW() - INTERVAL '5 hour', NULL, 15, 17, 2, NOW() - INTERVAL '6 hour 5 min'),
  ('Customer 8', '9100000004', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '3 hour 40 minute')::time, 6, 'COMPLETED', 4, 0, NOW() - INTERVAL '5 hour', NOW() - INTERVAL '3 hour 45 min', NULL, 18, 20, 2, NOW() - INTERVAL '5 hour 10 min'),
  ('Customer 9', '9100000005', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '3 hour 10 minute')::time, 6, 'COMPLETED', 5, 0, NOW() - INTERVAL '4 hour', NOW() - INTERVAL '2 hour 50 min', NULL, 16, 18, 2, NOW() - INTERVAL '4 hour 10 min'),
  ('Customer 10', '9100000006', CURRENT_DATE, (CURRENT_TIMESTAMP - INTERVAL '2 hour 30 minute')::time, 2, 'COMPLETED', 6, 0, NOW() - INTERVAL '3 hour', NOW() - INTERVAL '2 hour', NULL, 8, 9, 1, NOW() - INTERVAL '3 hour 10 min');

-- 4) Insert WAITING bookings with clear customer naming
WITH waiting_rows AS (
  INSERT INTO bookings (
    name,
    phone,
    booking_date,
    booking_time,
    guests,
    status,
    table_id,
    wait_time_minutes,
    seated_at,
    expected_end_at,
    no_show_at,
    predicted_wait_minutes,
    actual_wait_minutes,
    prediction_error,
    created_at
  )
  SELECT
    'Customer ' || (10 + gs),
    '9200' || LPAD(gs::text, 6, '0'),
    CURRENT_DATE,
    (CURRENT_TIMESTAMP - INTERVAL '90 minute' + (((gs * 5) % 180) * INTERVAL '1 minute'))::time,
    CASE
      WHEN gs % 6 IN (0, 1) THEN 2
      WHEN gs % 6 IN (2, 3) THEN 4
      ELSE 6
    END AS guests,
    'WAITING',
    NULL,
    25 + (gs % 80),
    NULL,
    NULL,
    NULL,
    25 + (gs % 80),
    NULL,
    NULL,
    NOW() - (gs * INTERVAL '2 minute')
  FROM generate_series(1, 36) gs
  RETURNING id, created_at
)
INSERT INTO waiting_queue (booking_id, priority_label, priority_score, arrival_time)
SELECT
  w.id,
  CASE
    WHEN rn % 10 = 0 THEN 'VIP'
    WHEN rn % 3 = 0 THEN 'ELDERLY'
    ELSE 'STANDARD'
  END AS priority_label,
  CASE
    WHEN rn % 10 = 0 THEN 3
    WHEN rn % 3 = 0 THEN 2
    ELSE 1
  END AS priority_score,
  w.created_at
FROM (
  SELECT id, created_at, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM waiting_rows
) w;

COMMIT;

-- Quick verification for table -> customer mapping
SELECT id, capacity, status, reset_ready_at
FROM tables
WHERE id BETWEEN 1 AND 6
ORDER BY id;

SELECT b.table_id, b.id AS booking_id, b.name, b.guests, b.status, b.seated_at, b.expected_end_at
FROM bookings b
WHERE b.status = 'CONFIRMED' AND b.table_id IS NOT NULL
ORDER BY b.table_id, b.created_at DESC;

SELECT b.id AS booking_id, b.name, b.guests, w.priority_label, w.priority_score, w.arrival_time
FROM waiting_queue w
JOIN bookings b ON b.id = w.booking_id
ORDER BY w.priority_score DESC, w.arrival_time ASC;
