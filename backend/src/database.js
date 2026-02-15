const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', '..', 'morning_brief.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id     INTEGER UNIQUE NOT NULL,
    telegram_name   TEXT,
    city            TEXT,
    lat             REAL,
    lon             REAL,
    timezone        TEXT,
    send_time       TEXT DEFAULT '07:00',
    google_refresh_token TEXT,
    is_bot_started  INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ru TEXT NOT NULL,
    name_en TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    UNIQUE(name_ru)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL
  )
`);

// Migration: add last_brief_date column (safe to run multiple times)
const columns = db.prepare("PRAGMA table_info(users)").all();
if (!columns.some(c => c.name === 'last_brief_date')) {
  db.exec("ALTER TABLE users ADD COLUMN last_brief_date TEXT");
}

// Bootstrap cities from CSV if table is empty
const cityCount = db.prepare('SELECT COUNT(*) as count FROM cities').get();
if (cityCount.count === 0) {
  const csvPath = path.join(__dirname, '..', '..', 'references', 'coordinates.csv');
  if (fs.existsSync(csvPath)) {
    let csv = fs.readFileSync(csvPath, 'utf-8');
    // Remove BOM if present
    if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);

    const lines = csv.split('\n').slice(1); // skip header
    const insert = db.prepare('INSERT OR IGNORE INTO cities (name_ru, name_en, lat, lon) VALUES (?, ?, ?, ?)');

    const importCities = db.transaction(() => {
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(',');
        const name_ru = parts[0];
        const name_en = parts[1];
        const lat = parseFloat(parts[3]);
        const lon = parseFloat(parts[4]);
        if (name_ru && name_en && !isNaN(lat) && !isNaN(lon)) {
          insert.run(name_ru, name_en, lat, lon);
        }
      }
    });

    importCities();
    const imported = db.prepare('SELECT COUNT(*) as count FROM cities').get();
    console.log(`Imported ${imported.count} cities from CSV`);
  } else {
    console.warn('Cities CSV not found at', csvPath);
  }
}

// ---- Auth token helpers ----

function createAuthToken(userId, token, expiresAt) {
  // Clean up expired tokens
  db.prepare("DELETE FROM auth_tokens WHERE expires_at < datetime('now')").run();
  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
}

function consumeAuthToken(token) {
  const row = db.prepare("SELECT * FROM auth_tokens WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!row) return null;
  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
  return row.user_id;
}

module.exports = db;
module.exports.createAuthToken = createAuthToken;
module.exports.consumeAuthToken = consumeAuthToken;
