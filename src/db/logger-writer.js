"use strict";

const path = require("path");
const { openDb: openConfiguredDb } = require("./connection");

const DEFAULT_DB_PATH = path.join(__dirname, "../../data/mysql.db");

const MEASUREMENT_KEYS = [
  "level",
  "flow",
  "totalIndex",
  "pH",
  "TDS",
  "amino",
  "nitrat"
];

const DEFAULT_TAG_META = {
  level: { tag_name: "Mực nước", unit: "m" },
  flow: { tag_name: "Lưu lượng", unit: "m³/h" },
  totalIndex: { tag_name: "Tổng lưu lượng", unit: "m³" },
  pH: { tag_name: "pH", unit: "pH" },
  TDS: { tag_name: "TDS", unit: "mg/L" },
  amino: { tag_name: "Amino", unit: "mg/L" },
  nitrat: { tag_name: "Nitrat", unit: "mg/L" }
};

function openDb(dbPath = DEFAULT_DB_PATH) {
  return openConfiguredDb(dbPath);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getDataTimestamp(item) {
  return item.data_ts || item.ts || item.timestamp || null;
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;

  const cleaned = String(value).replace(/,/g, "").trim();
  const num = Number(cleaned);

  return Number.isNaN(num) ? null : num;
}

function resolveLoggerId(item) {
  const source = item.source || "unknown";
  const rawId =
    item.raw_id ||
    item.mqtt_id ||
    item.scada_id ||
    item.tva_id ||
    item.monre_id;

  return item.logger_id || item.station_id || `${source}_${rawId}`;
}

function resolveRawId(item) {
  return (
    item.raw_id ||
    item.mqtt_id ||
    item.scada_id ||
    item.tva_id ||
    item.monre_id ||
    item.station_id ||
    item.logger_id
  );
}

async function upsertLoggerPoint(db, item) {
  const loggerId = resolveLoggerId(item);
  const itemSource = item.source || "unknown";
  const rawId = resolveRawId(item);
  const name = item.name || String(rawId || loggerId).toUpperCase();

  await run(
    db,
    `
    INSERT INTO logger_points (
      logger_id, source, raw_id, name, lat, lng, enabled
    )
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(logger_id) DO UPDATE SET
      source = EXCLUDED.source,
      raw_id = EXCLUDED.raw_id,
      name = COALESCE(EXCLUDED.name, logger_points.name),
      lat = COALESCE(EXCLUDED.lat, logger_points.lat),
      lng = COALESCE(EXCLUDED.lng, logger_points.lng),
      enabled = 1,
      updated_ts = CURRENT_TIMESTAMP
    `,
    [
      loggerId,
      itemSource,
      rawId,
      name,
      item.lat ?? null,
      item.lng ?? null
    ]
  );

  return loggerId;
}

async function upsertLoggerTag(db, loggerId, tagKey) {
  const meta = DEFAULT_TAG_META[tagKey] || {};

  await run(
    db,
    `
    INSERT INTO logger_tags (
      logger_id, tag_key, tag_name, unit, enabled
    )
    VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(logger_id, tag_key) DO UPDATE SET
      tag_name = COALESCE(logger_tags.tag_name, EXCLUDED.tag_name),
      unit = COALESCE(logger_tags.unit, EXCLUDED.unit),
      enabled = 1,
      updated_ts = CURRENT_TIMESTAMP
    `,
    [
      loggerId,
      tagKey,
      meta.tag_name || tagKey,
      meta.unit || ""
    ]
  );
}

async function insertReading(db, loggerId, tagKey, dataTs, value) {
  await run(
    db,
    `
    INSERT INTO logger_readings (
      logger_id, tag_key, data_ts, value
    )
    VALUES (?, ?, ?, ?)
    `,
    [loggerId, tagKey, dataTs, value]
  );
}

async function upsertLatest(db, loggerId, tagKey, dataTs, value) {
  await run(
    db,
    `
    INSERT INTO logger_latest (
      logger_id, tag_key, data_ts, value
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(logger_id, tag_key) DO UPDATE SET
      data_ts = EXCLUDED.data_ts,
      value = EXCLUDED.value,
      saved_ts = CURRENT_TIMESTAMP
    `,
    [loggerId, tagKey, dataTs, value]
  );
}

async function saveLoggerPayload(db, item) {
  if (!item || typeof item !== "object") {
    return { inserted: 0 };
  }

  const dataTs = getDataTimestamp(item);
  if (!dataTs) {
    return { inserted: 0 };
  }

  const loggerId = await upsertLoggerPoint(db, item);

  let inserted = 0;

  for (const tagKey of MEASUREMENT_KEYS) {
    if (!(tagKey in item)) continue;

    const value = normalizeNumber(item[tagKey]);
    if (value === null) continue;

    await upsertLoggerTag(db, loggerId, tagKey);
    await insertReading(db, loggerId, tagKey, dataTs, value);
    await upsertLatest(db, loggerId, tagKey, dataTs, value);

    inserted += 1;
  }

  return { inserted };
}

async function saveLoggerPayloads(payloads, options = {}) {
  const dbPath = options.dbPath || options.db || DEFAULT_DB_PATH;
  const db = options.dbInstance || openDb(dbPath);
  const shouldClose = !options.dbInstance;

  let inserted = 0;
  let loggers = 0;

  try {
    await run(db, "BEGIN TRANSACTION");

    for (const item of payloads || []) {
      const result = await saveLoggerPayload(db, item);

      if (result.inserted > 0) {
        inserted += result.inserted;
        loggers += 1;
      }
    }

    await run(db, "COMMIT");

    return {
      success: true,
      loggers,
      inserted
    };
  } catch (err) {
    await run(db, "ROLLBACK").catch(() => {});

    return {
      success: false,
      loggers,
      inserted,
      error: err.message || String(err)
    };
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

function parseNdjson(text) {
  if (!text) return [];

  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function processNdjson(ndjson, options = {}) {
  const payloads = parseNdjson(ndjson);
  return saveLoggerPayloads(payloads, options);
}

module.exports = {
  saveLoggerPayload,
  saveLoggerPayloads,
  processNdjson,
  parseNdjson,
  MEASUREMENT_KEYS,
  DEFAULT_TAG_META
};
