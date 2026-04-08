const path = require('path');
const fs = require('fs');
const { pool } = require('../config/db');

(async () => {
  const filePath = path.join(__dirname, '..', 'testing', 'reset.sql');
  try {
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log('Executing SQL file:', filePath);
    const res = await pool.query(sql);
    console.log('Execution complete. Result:', res.command || 'OK');
  } catch (err) {
    console.error('Error executing SQL:', err);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch (e) {}
  }
})();
