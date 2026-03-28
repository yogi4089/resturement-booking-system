CREATE TABLE IF NOT EXISTS tables (
  id SERIAL PRIMARY KEY,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED')),
  reset_ready_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(25) NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  guests INTEGER NOT NULL CHECK (guests > 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('CONFIRMED', 'WAITING', 'CANCELLED', 'COMPLETED')),
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  wait_time_minutes INTEGER NOT NULL DEFAULT 0,
  seated_at TIMESTAMP NULL,
  expected_end_at TIMESTAMP NULL,
  no_show_at TIMESTAMP NULL,
  predicted_wait_minutes INTEGER NULL,
  actual_wait_minutes INTEGER NULL,
  prediction_error INTEGER NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waiting_queue (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  priority_label VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
  priority_score INTEGER NOT NULL DEFAULT 1,
  arrival_time TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  availability BOOLEAN NOT NULL DEFAULT TRUE
);

-- Migration-safe upgrades for existing/older databases
ALTER TABLE tables ADD COLUMN IF NOT EXISTS reset_ready_at TIMESTAMP NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wait_time_minutes INTEGER;
ALTER TABLE bookings ALTER COLUMN wait_time_minutes SET DEFAULT 0;
UPDATE bookings SET wait_time_minutes = 0 WHERE wait_time_minutes IS NULL;
ALTER TABLE bookings ALTER COLUMN wait_time_minutes SET NOT NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seated_at TIMESTAMP NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expected_end_at TIMESTAMP NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMP NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS predicted_wait_minutes INTEGER NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS actual_wait_minutes INTEGER NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prediction_error INTEGER NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;
ALTER TABLE bookings ALTER COLUMN created_at SET DEFAULT NOW();
UPDATE bookings SET created_at = NOW() WHERE created_at IS NULL;
ALTER TABLE bookings ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS priority_label VARCHAR(20);
ALTER TABLE waiting_queue ALTER COLUMN priority_label SET DEFAULT 'STANDARD';
UPDATE waiting_queue SET priority_label = 'STANDARD' WHERE priority_label IS NULL;
ALTER TABLE waiting_queue ALTER COLUMN priority_label SET NOT NULL;

ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS priority_score INTEGER;
ALTER TABLE waiting_queue ALTER COLUMN priority_score SET DEFAULT 1;
UPDATE waiting_queue SET priority_score = 1 WHERE priority_score IS NULL;
ALTER TABLE waiting_queue ALTER COLUMN priority_score SET NOT NULL;

ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS arrival_time TIMESTAMP;
ALTER TABLE waiting_queue ALTER COLUMN arrival_time SET DEFAULT NOW();
UPDATE waiting_queue SET arrival_time = NOW() WHERE arrival_time IS NULL;
ALTER TABLE waiting_queue ALTER COLUMN arrival_time SET NOT NULL;

-- Helpful indexes for admin tables/waiting list pages
CREATE INDEX IF NOT EXISTS idx_bookings_status_created_at ON bookings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_table_status_created_at ON bookings(table_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waiting_queue_priority_arrival ON waiting_queue(priority_score DESC, arrival_time ASC);
CREATE INDEX IF NOT EXISTS idx_tables_status_capacity ON tables(status, capacity ASC);

INSERT INTO tables (capacity, status)
SELECT * FROM (
  VALUES
    (2, 'AVAILABLE'),
    (2, 'AVAILABLE'),
    (4, 'AVAILABLE'),
    (4, 'AVAILABLE'),
    (6, 'AVAILABLE'),
    (8, 'AVAILABLE')
) AS seed(capacity, status)
WHERE NOT EXISTS (SELECT 1 FROM tables);

INSERT INTO menu_items (name, price, availability)
SELECT * FROM (
  VALUES
    ('Truffle Saffron Risotto', 480, TRUE),
    ('Smoked Pepper Lamb Chops', 920, TRUE),
    ('Charcoal Butter Prawns', 760, TRUE),
    ('Gold Leaf Kulfi', 260, TRUE),
    ('Chef''s Quick Mezze Plate', 340, TRUE)
) AS seed(name, price, availability)
WHERE NOT EXISTS (SELECT 1 FROM menu_items);
