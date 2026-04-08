BEGIN;

TRUNCATE TABLE waiting_queue, bookings RESTART IDENTITY CASCADE;

UPDATE tables
SET status = 'AVAILABLE',
    reset_ready_at = NULL;

COMMIT;
