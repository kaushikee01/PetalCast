// The database: one SQLite file, created automatically on first run.
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");   // faster, safer writes
db.pragma("foreign_keys = ON");    // deleting a user also deletes their data

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    units        TEXT NOT NULL DEFAULT 'metric' CHECK (units IN ('metric', 'imperial')),
    email_alerts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS saved_places (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    region     TEXT NOT NULL DEFAULT '',
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    place_key  TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, place_key)
  );

  CREATE TABLE IF NOT EXISTS recent_searches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    region      TEXT NOT NULL DEFAULT '',
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    place_key   TEXT NOT NULL,
    searched_at INTEGER NOT NULL,
    UNIQUE (user_id, place_key)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    region            TEXT NOT NULL DEFAULT '',
    lat               REAL NOT NULL,
    lon               REAL NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('rain', 'heat', 'cold', 'wind', 'aqi', 'daily')),
    threshold         REAL,
    enabled           INTEGER NOT NULL DEFAULT 1,
    last_triggered_at INTEGER,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_id   INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    is_read    INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications (user_id, is_read, created_at);
`);

module.exports = db;
