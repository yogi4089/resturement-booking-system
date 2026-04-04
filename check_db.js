const { query } = require('./backend/config/db');

async function run() {
  try {
    const res = await query(`SELECT id, name, status, table_id, seated_at, created_at FROM bookings WHERE name = 'Customer 36'`);
    console.log('Bookings:', res.rows);
    
    if (res.rows.length > 0) {
      const ids = res.rows.map(r => r.id);
      const qRes = await query(`SELECT * FROM waiting_queue WHERE booking_id = ANY($1::int[])`, [ids]);
      console.log('Queue:', qRes.rows);
    }
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
