"use strict";

const {
  openDb,
  shouldUsePostgres,
  closePgPool,
  explainDatabaseError
} = require("./connection");

const db = openDb();

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => err ? reject(err) : resolve());
  });
}

async function initPostgres() {
  await run(`
    CREATE TABLE IF NOT EXISTS logger_points (
      id SERIAL PRIMARY KEY,
      logger_id TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL,
      raw_id TEXT NOT NULL,
      name TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      enabled INTEGER DEFAULT 1,
      created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS logger_tags (
      id SERIAL PRIMARY KEY,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      tag_name TEXT,
      unit TEXT,
      enabled INTEGER DEFAULT 1,
      min_value DOUBLE PRECISION,
      max_value DOUBLE PRECISION,
      display_order INTEGER DEFAULT 0,
      UNIQUE(logger_id, tag_key)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS logger_readings (
      id SERIAL PRIMARY KEY,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      data_ts TEXT NOT NULL,
      saved_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      value DOUBLE PRECISION
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS logger_latest (
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      data_ts TEXT NOT NULL,
      saved_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      value DOUBLE PRECISION,
      PRIMARY KEY(logger_id, tag_key)
    )
  `);

  await run(`
    CREATE INDEX IF NOT EXISTS idx_logger_readings
    ON logger_readings(logger_id, tag_key, data_ts DESC)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS kpi_configs (
      id SERIAL PRIMARY KEY,
      kpi_id TEXT UNIQUE NOT NULL,
      kpi_type TEXT NOT NULL,
      name TEXT,
      tag_key TEXT NOT NULL,
      logger_ids TEXT NOT NULL,
      kpi_metrics TEXT DEFAULT '[]',
      max_value DOUBLE PRECISION,
      enabled INTEGER DEFAULT 1,
      created_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tag_thresholds (
      id SERIAL PRIMARY KEY,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      min_value DOUBLE PRECISION,
      max_value DOUBLE PRECISION,
      warning_enabled INTEGER DEFAULT 1,
      message TEXT,
      UNIQUE(logger_id, tag_key)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id SERIAL PRIMARY KEY,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      status TEXT NOT NULL,
      value DOUBLE PRECISION,
      message TEXT,
      sent_ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.close(async () => {
    await closePgPool();
    console.log("[DB] Init postgres logger tables done");
  });
}

if (shouldUsePostgres()) {
  initPostgres().catch((err) => {
    console.error("[DB] Init failed:", explainDatabaseError(err));
    process.exitCode = 1;
    db.close(() => closePgPool().catch(() => {}));
  });
  return;
}

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

  db.run(`
    CREATE TABLE IF NOT EXISTS kpi_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kpi_id TEXT UNIQUE NOT NULL,
      kpi_type TEXT NOT NULL,       -- kpi-flow | kpi-total
      name TEXT,
      tag_key TEXT NOT NULL,        -- flow | totalIndex
      logger_ids TEXT NOT NULL,     -- JSON array
      enabled INTEGER DEFAULT 1,
      created_ts TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_ts TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tag_thresholds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      min_value REAL,
      max_value REAL,
      warning_enabled INTEGER DEFAULT 1,
      message TEXT,
      UNIQUE(logger_id, tag_key)
    )
  `);

});

db.run(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_ts TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS alert_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    logger_id TEXT NOT NULL,
    tag_key TEXT NOT NULL,
    status TEXT NOT NULL,
    value REAL,
    message TEXT,
    sent_ts TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);



db.close(() => {
  console.log("[DB] Init logger tables done");
});
