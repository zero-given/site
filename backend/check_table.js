const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('../monitor/January 07 - Session 2/SCAN_RECORDS.db');

db.all('PRAGMA table_info("DOGEIUS_0x680197a5bc303c803338c64d844818d86e11ee11")', [], (err, info) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Table structure:', JSON.stringify(info, null, 2));
  }
  db.close();
}); 