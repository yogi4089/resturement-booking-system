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
- `avg_dining_time = 45 mins` (Baseline)
- `base_queue_delay = queue_size * 10`
- `adjusted_queue_delay = base_queue_delay * demand_multiplier`

Duration Profiles (Rule-first):
- **Lunch** (11 AM - 3 PM): 30 mins
- **Dinner** (Mon-Fri 7 PM - 11 PM): 45 mins
- **Weekend Dinner** (Sat/Sun 7 PM - 11 PM): 60 mins
- **6+ Guests**: Adds +15/20 min buffer to profiles.

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
- `AVAILABLE`: Ready for seating.
- `OCCUPIED`: Currently in use.

Admin controls:
- **+15m Button**: Extends the current guest's ETA by 15 minutes. This automatically ripples a +15m wait update to any queue guests with a <20m ETA or who are already overdue.
- **Completed Button**: Marks a table for reset. This triggers a 2-minute "Reset Buffer" during which the system predicts the "Next" customer.
- **Reset Done**: Manually ends the reset buffer to immediately seat the next guest or make the table available.

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

## Recent Updates
- **Real-Time Web Sync (SSE)**: All admin panels now synchronize automatically using Server-Sent Events, eliminating manual refreshes.
- **Dynamic +15m Extension**: Admins can extend table turnover by 15 mins. This intelligently updates wait times for the next guests in line who are within a 20-minute allocation window.
- **Optimized Turnover Logic**: Dining durations have been tuned for faster cycles (30-60m baselines) and more accurate queue predictions (10m per party delay).
- **Synced "Next" Allocation**: The "Next" customer prediction on Table cards now perfectly aligns with Waiting List sorting (Overdue guests prioritized over Priority score).
- **Auto-Assignment Daemon**: A background job that processes a 2-minute table reset buffer. It predicts the "Next in Line" customer and automatically promotes them without requiring manual admin approval.
- **Flexible Seating Engine**: Relaxed capacity matching permits routing smaller parties to larger tables when demand enables it (e.g. 2 guests at a 6+ person table).

## Future Recommendations & Known Edge Cases

### Suggested Enhancements
- **SMS/Email Notifications**: Integrate Twilio or SendGrid so guests are pinged immediately upon table availability rather than relying on host/hostess calls.
- **Visual Floor Plan**: A drag-and-drop map of the physical restaurant layout to represent table statuses better than a list view.
- **POS Integration**: Sync table sessions with bill status, allowing the app to auto-free tables when a check is paid.

### System Infrastructure Needs
- **TypeScript Migration**: Refactoring controller boundaries into TypeScript will eliminate structural silent errors (especially regarding complex queue simulation algorithms).
- **Automated Tests**: Establish Jest supertest suites for booking allocations and queue movements to guarantee future modifications don't break table assignments.
- **Dockerization**: Bundle PostgreSQL and Node servers into `docker-compose` for frictionless deployments.

### Identified Behavioral Quirks
- **Table Allocation Sorting**: The auto-assign daemon currently parses available tables by ID order. This could prematurely steal an 8-seater for a 5-guest party instead of searching for a 6-seater first, slightly bottlenecking large parties.
- **SSE Connection Dropping**: Currently, standard SSE limits connections. On a highly unreliable mobile network for admins, it might occasionally desync and require a hard page reload.