const Database = require('better-sqlite3');
const path = require('path');

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

// Migration: add last_brief_date column (safe to run multiple times)
const columns = db.prepare("PRAGMA table_info(users)").all();
if (!columns.some(c => c.name === 'last_brief_date')) {
  db.exec("ALTER TABLE users ADD COLUMN last_brief_date TEXT");
}

module.exports = db;
