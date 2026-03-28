# Restaurant Management System

A full-stack restaurant reservation platform with a premium customer UI and an operational admin dashboard.

Tech stack:
- Backend: Node.js + Express (MVC)
- Frontend: EJS + Bootstrap + custom dark luxury theme
- Database: PostgreSQL

## 1. System Overview

The system is designed to:
- Manage restaurant table bookings
- Prevent overbooking with live table/capacity checks
- Handle excess demand with a priority waiting queue
- Improve customer experience with wait-time prediction and alternate slots
- Help admin manage bookings, queue, tables, menu, and insights

## 2. Actors

### Customer
- Book table
- View menu
- Check booking status
- Join waiting list
- Pick suggested alternate slot when preferred slot is unavailable

### System
- Availability checking
- Priority queue management
- Wait-time prediction with day/time demand profile
- Data storage and analytics aggregates

### Admin
- Manage bookings
- Control queue promotions
- Mark tables free/occupied
- Add/toggle/delete menu items

## 3. Complete Flow

Booking flow:
1. Customer submits form
2. System checks table availability and capacity match
3. If YES:
- Booking is `CONFIRMED`
- Table is assigned
4. If NO:
- Show estimated wait + demand profile
- Show 2-4 next slot alternatives
- Customer can choose alternate slot or join waiting list

When admin marks a table free:
1. Table status becomes `AVAILABLE`
2. System picks next eligible waiting booking by priority + arrival time
3. Booking gets assigned and promoted
4. Table becomes `OCCUPIED`

## 4. Waiting Time Logic

Base formula:

```text
wait_time = ceil((occupied_tables * avg_dining_time / total_tables) + adjusted_queue_delay)
```

Where:
- `avg_dining_time = 75 mins`
- `base_queue_delay = queue_size * 15`
- `adjusted_queue_delay = base_queue_delay * demand_multiplier`

Demand profile (rule-first, config-driven):
- Mon-Fri day (non-night): `LOW`
- Mon-Fri night (7 PM-11 PM): `MEDIUM`
- Saturday night (7 PM-11 PM): `HIGH`
- Sunday night (7 PM-11 PM): `HIGHEST`
- Other times: `LOW`

Current default multipliers:
- `LOW=1.0`
- `MEDIUM=1.35`
- `HIGH=1.65`
- `HIGHEST=1.95`

Wait responses include:
- `waitTime`
- `nextSlot`
- `waitProfile`
- `multiplier`
- computed `components`

## 5. Priority Queue System

Queue is sorted by:
1. Priority (`VIP`, `ELDERLY`, `STANDARD`)
2. Arrival time

This is intentionally not plain FIFO.

## 6. Table Management

Table states:
- `AVAILABLE`
- `OCCUPIED`

Admin controls these states manually in dashboard for real-world accuracy.

## 7. Booking States

- `CONFIRMED`
- `WAITING`
- `CANCELLED`
- `COMPLETED`

## 8. Menu System

Customer view:
- Item name
- Price
- Availability

Admin actions:
- Add item
- Toggle availability
- Delete item

Bonus:
- Quick-dish suggestion area on home page

## 9. Analytics

Admin dashboard shows:
- Confirmed count
- Waiting count
- Average wait
- Current demand profile
- Busy hours
- Popular weekdays
- Average wait by demand bucket

## 10. Architecture

Project structure:

```text
resturent managment/
+-- frontend/
|   +-- public/
|   |   +-- styles.css
|   +-- views/
|       +-- home.ejs
|       +-- menu.ejs
|       +-- status.ejs
|       +-- admin-login.ejs
|       +-- admin-dashboard.ejs
|       +-- 404.ejs
|       +-- 500.ejs
+-- backend/
|   +-- app.js
|   +-- server.js
|   +-- schema.sql
|   +-- .env.example
|   +-- config/
|   +-- controllers/
|   +-- middleware/
|   +-- models/
|   +-- routes/
|   +-- utils/
+-- README.md
```

## 11. Database Tables

### `tables`
- `id`
- `capacity`
- `status`

### `bookings`
- `id`
- `name`
- `phone`
- `booking_date`
- `booking_time`
- `guests`
- `status`
- `table_id`
- `wait_time_minutes`
- `created_at`

### `waiting_queue`
- `booking_id`
- `priority_label`
- `priority_score`
- `arrival_time`

### `menu_items`
- `id`
- `name`
- `price`
- `availability`

## 12. APIs

### Booking
- `POST /bookings` (create or return alternate-slot/waitlist offer)
- `POST /bookings/alternative` (re-attempt chosen suggested slot)
- `POST /bookings/waitlist` (join waiting list)
- `POST /bookings/:id/cancel`
- `GET /bookings`
- `GET /api/bookings`

### Queue
- `GET /queue`
- `GET /api/queue`
- `GET /api/wait-estimate` (includes profile + alternatives)
- Admin override promote: `POST /admin/queue/:bookingId/promote`

### Tables
- Admin update table state: `POST /admin/tables/:id/status`

### Menu
- Public: `GET /menu`
- Admin add: `POST /admin/menu`
- Admin toggle: `POST /admin/menu/:id/toggle`
- Admin delete: `POST /admin/menu/:id/delete`

### Admin Auth / Dashboard
- `GET /admin/login`
- `POST /admin/login`
- `POST /admin/logout`
- `GET /admin`

## 13. Admin Login

Admin login is required for dashboard operations.

Default credentials (override in `.env`):
- `ADMIN_USER=admin`
- `ADMIN_PASS=admin123`

## 14. Notifications

MVP model:
- Manual call/notification by admin staff
- No SMS integration yet (cost-saving phase)

## 15. Frontend

Theme:
- Dark luxury restaurant style
- Gold accents
- Premium look and feel

Pages:
- Home (Booking)
- Menu
- Status
- Admin Login
- Admin Dashboard

## Local Setup

Prerequisites:
- Node.js 18+
- PostgreSQL

Install:

```bash
cd backend
npm install
```

Configure env:

1. Copy `backend/.env.example` to `backend/.env`
2. Update values

Example:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurant_management
SESSION_SECRET=change-me
ADMIN_USER=admin
ADMIN_PASS=admin123
DB_SSL=false
```

Create DB schema:

```bash
psql -U postgres -d restaurant_management -f backend/schema.sql
```

Run locally:

```bash
cd backend
npm start
```

Open:
- `http://localhost:3000`

## Verification Checklist

Implemented from your requested plan:
- Day/time-aware wait engine with Mon-Fri/Sat/Sun-night demand pattern
- Medium-gradient profile multipliers via config
- Alternate-slot suggestions + waitlist fallback
- Admin demand insights panel (busy hours, popular days, wait buckets)
- Menu delete action (secured admin route + dashboard button)
- MVC backend retained (no rollback to monolithic server)