-- cd "E:\my web\resturent managment\backend"
-- psql -U postgres -d restaurant_management -f reset.sql

BEGIN;

TRUNCATE TABLE waiting_queue, bookings RESTART IDENTITY CASCADE;

UPDATE tables
SET status = 'AVAILABLE',
    reset_ready_at = NULL;

COMMIT;
