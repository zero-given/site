const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Function to find latest session folder
const getLatestSessionPath = () => {
  const monitorPath = path.join(__dirname, '../monitor');
  const sessionFolders = fs.readdirSync(monitorPath)
    .filter(f => fs.statSync(path.join(monitorPath, f)).isDirectory() && /^[A-Za-z]+ \d{2} - Session \d+$/.test(f))
    .map(f => ({
      name: f,
      time: fs.statSync(path.join(monitorPath, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (sessionFolders.length === 0) {
    throw new Error('No session folders found in monitor directory');
  }

  return path.join(monitorPath, sessionFolders[0].name, 'scan_records.db');
};

// Configure database path
const dbPath = getLatestSessionPath();
console.log('Database location:', dbPath);

// Create database connection
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to the SQLite database');
  }
});

// Verify database schema
db.get("PRAGMA table_info(scan_records)", (err, row) => {
  if (err) {
    console.error('Error verifying database schema:', err);
    process.exit(1);
  }
  if (!row) {
    console.error('Database schema verification failed - scan_records table not found');
    process.exit(1);
  }
});

// Promisify database methods
const all = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

const get = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const run = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

module.exports = {
  all,
  get,
  run,
  db
};
