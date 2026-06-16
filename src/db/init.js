"use strict";

const { openDb } = require("./connection");

const db = openDb();

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS logger_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_id TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      raw_id TEXT NOT NULL,
      name TEXT,
      lat REAL,
      lng REAL,
      enabled INTEGER DEFAULT 1,
      created_ts TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_ts TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logger_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      tag_name TEXT,
      unit TEXT,
      enabled INTEGER DEFAULT 1,
      min_value REAL,
      max_value REAL,
      display_order INTEGER DEFAULT 0,
      UNIQUE(logger_id, tag_key)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logger_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      data_ts TEXT NOT NULL,
      saved_ts TEXT DEFAULT CURRENT_TIMESTAMP,
      value REAL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logger_latest (
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      data_ts TEXT NOT NULL,
      saved_ts TEXT DEFAULT CURRENT_TIMESTAMP,
      value REAL,
      PRIMARY KEY(logger_id, tag_key)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_logger_readings
    ON logger_readings(logger_id, tag_key, data_ts DESC)
  `);
});

db.close(() => {
  console.log("[DB] Init logger tables done");
});