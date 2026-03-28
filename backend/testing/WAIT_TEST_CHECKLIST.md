# Wait-Time Test Checklist (Fixed 6 Tables)

## 1) Load seed (keeps table count unchanged)

```bash
psql -U postgres -d restaurant_management -f backend/testing/test_seed_wait_queue.sql
```

This seed:
- does NOT insert/delete tables
- uses only table ids `1..6` (schema default)
- uses clear customer names: `Customer 1`, `Customer 2`, ...
- seeds waiting queue with mixed priorities

## 2) Start app

```bash
cd backend
npm start
```

## 3) Verify who is seated on which table

```sql
SELECT b.table_id, b.id AS booking_id, b.name, b.guests, b.status, b.seated_at, b.expected_end_at
FROM bookings b
WHERE b.status = 'CONFIRMED' AND b.table_id IS NOT NULL
ORDER BY b.table_id, b.created_at DESC;
```

## 4) Verify queue order

```sql
SELECT b.id AS booking_id, b.name, b.guests, w.priority_label, w.priority_score, w.arrival_time
FROM waiting_queue w
JOIN bookings b ON b.id = w.booking_id
ORDER BY w.priority_score DESC, w.arrival_time ASC;
```

## 5) API checks for party-size behavior

- 2 guests:
`GET /api/wait-estimate?booking_date=2026-03-30&booking_time=20:00&guests=2&priority=STANDARD`

- 6 guests:
`GET /api/wait-estimate?booking_date=2026-03-30&booking_time=20:00&guests=6&priority=STANDARD`

- 6 guests VIP:
`GET /api/wait-estimate?booking_date=2026-03-30&booking_time=20:00&guests=6&priority=VIP`

Compare:
- `components.eligibleTableCount`
- `components.queueAhead`
- `waitTime`, `waitRange`

## 6) UI checks

1. `/admin/tables` confirms Customer 1/2/3... table mapping cards
2. `/admin/waiting-list` waiting section shows `Give Seat` with preselected table
3. `/admin/waiting-list` booked section shows seated and expected free timings

## 7) Large-party stress seed (6+ guest heavy)

```bash
psql -U postgres -d restaurant_management -f backend/testing/test_seed_large_party.sql
```

Then verify:
- table mapping query from step 3
- queue order query from step 4
- `GET /api/wait-estimate?...&guests=6&priority=STANDARD`
- `GET /api/wait-estimate?...&guests=6&priority=VIP`
