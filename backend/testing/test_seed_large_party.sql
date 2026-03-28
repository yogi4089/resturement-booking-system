BEGIN;

-- Large-party stress seed (6-guest heavy)
-- Keeps table count unchanged; uses only table ids 1..6.

DELETE FROM waiting_queue;
DELETE FROM bookings;

UPDATE tables
SET status = 'AVAILABLE',
    reset_ready_at = NULL
WHERE id BETWEEN 1 AND 6;

-- Keep large tables occupied first (table 5/6 are key for 6 guests), plus one 4-top.
UPDATE tables
SET status = 'OCCUPIED'
WHERE id IN (3, 5, 6);

-- Confirmed (heavy 6-guest bias) with clear customer naming
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
  ('Customer 1', '9300000001', '2026-03-28', '19:00', 6, 'CONFIRMED', 5, 0, NOW() - INTERVAL '70 min', NOW() + INTERVAL '35 min', NULL, 0, 0, 0, NOW() - INTERVAL '75 min'),
  ('Customer 2', '9300000002', '2026-03-28', '19:15', 7, 'CONFIRMED', 6, 0, NOW() - INTERVAL '65 min', NOW() + INTERVAL '45 min', NULL, 0, 0, 0, NOW() - INTERVAL '70 min'),
  ('Customer 3', '9300000003', '2026-03-28', '19:30', 4, 'CONFIRMED', 3, 0, NOW() - INTERVAL '55 min', NOW() + INTERVAL '25 min', NULL, 0, 0, 0, NOW() - INTERVAL '60 min'),

  ('Customer 4', '9310000001', '2026-03-28', '13:00', 6, 'COMPLETED', 5, 0, NOW() - INTERVAL '7 hour', NOW() - INTERVAL '5 hour 45 min', NULL, 20, 24, 4, NOW() - INTERVAL '7 hour 10 min'),
  ('Customer 5', '9310000002', '2026-03-28', '14:10', 8, 'COMPLETED', 6, 0, NOW() - INTERVAL '6 hour', NOW() - INTERVAL '4 hour 40 min', NULL, 22, 26, 4, NOW() - INTERVAL '6 hour 15 min'),
  ('Customer 6', '9310000003', '2026-03-28', '15:20', 6, 'COMPLETED', 5, 0, NOW() - INTERVAL '5 hour', NOW() - INTERVAL '3 hour 50 min', NULL, 18, 21, 3, NOW() - INTERVAL '5 hour 20 min');

-- WAITING queue: mostly 6+ guests to stress large-party allocation
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
    'Customer ' || (6 + gs),
    '9320' || LPAD(gs::text, 6, '0'),
    DATE '2026-03-28',
    (TIME '19:30' + ((gs * 4) % 150) * INTERVAL '1 minute')::time,
    CASE
      WHEN gs % 5 IN (0, 1, 2) THEN 6
      WHEN gs % 5 = 3 THEN 7
      ELSE 8
    END AS guests,
    'WAITING',
    NULL,
    40 + (gs % 100),
    NULL,
    NULL,
    NULL,
    40 + (gs % 100),
    NULL,
    NULL,
    NOW() - (gs * INTERVAL '90 seconds')
  FROM generate_series(1, 48) gs
  RETURNING id, created_at
)
INSERT INTO waiting_queue (booking_id, priority_label, priority_score, arrival_time)
SELECT
  w.id,
  CASE
    WHEN rn % 8 = 0 THEN 'VIP'
    WHEN rn % 3 = 0 THEN 'ELDERLY'
    ELSE 'STANDARD'
  END,
  CASE
    WHEN rn % 8 = 0 THEN 3
    WHEN rn % 3 = 0 THEN 2
    ELSE 1
  END,
  w.created_at
FROM (
  SELECT id, created_at, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM waiting_rows
) w;

COMMIT;

-- verification with clear seat mapping
SELECT id, capacity, status FROM tables WHERE id BETWEEN 1 AND 6 ORDER BY id;

SELECT b.table_id, b.id AS booking_id, b.name, b.guests, b.status, b.seated_at, b.expected_end_at
FROM bookings b
WHERE b.status = 'CONFIRMED' AND b.table_id IS NOT NULL
ORDER BY b.table_id, b.created_at DESC;

SELECT b.id AS booking_id, b.name, b.guests, w.priority_label, w.priority_score, w.arrival_time
FROM waiting_queue w
JOIN bookings b ON b.id = w.booking_id
ORDER BY w.priority_score DESC, w.arrival_time ASC;
