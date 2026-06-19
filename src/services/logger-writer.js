"use strict";

const { openDb } = require("../db/connection");

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

function getNow() {
  const d = new Date();
  const pad = v => String(v).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(String(value).replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

async function writeLoggerPayload(payload) {
  const db = openDb();

  const {
    source = "device",
    raw_id,
    logger_id,
    name,
    lat,
    lng,
    ts,
    tags = {}
  } = payload;

  if (!logger_id) {
    throw new Error("Thiếu logger_id");
  }

  const dataTs = ts || getNow();
  const savedTs = getNow();

  try {
    await run(
      db,
      `
      INSERT INTO logger_points (
        logger_id, source, raw_id, name, lat, lng, enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(logger_id) DO UPDATE SET
        source = COALESCE(excluded.source, source),
        raw_id = COALESCE(excluded.raw_id, raw_id),
        name = COALESCE(excluded.name, name),
        lat = COALESCE(excluded.lat, lat),
        lng = COALESCE(excluded.lng, lng),
        enabled = 1,
        updated_ts = CURRENT_TIMESTAMP
      `,
      [
        logger_id,
        source,
        raw_id || logger_id,
        name || logger_id,
        normalizeNumber(lat),
        normalizeNumber(lng)
      ]
    );

    const written = [];

    for (const [tagKey, tagData] of Object.entries(tags)) {
      const value =
        typeof tagData === "object"
          ? normalizeNumber(tagData.value)
          : normalizeNumber(tagData);

      if (value === null) continue;

      const tagName =
        typeof tagData === "object"
          ? tagData.tag_name || tagKey
          : tagKey;

      const unit =
        typeof tagData === "object"
          ? tagData.unit || ""
          : "";

      await run(
        db,
        `
        INSERT INTO logger_tags (
          logger_id, tag_key, tag_name, unit, enabled
        )
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(logger_id, tag_key) DO UPDATE SET
          tag_name = COALESCE(excluded.tag_name, tag_name),
          unit = COALESCE(excluded.unit, unit),
          enabled = 1
        `,
        [logger_id, tagKey, tagName, unit]
      );

      await run(
        db,
        `
        INSERT INTO logger_readings (
          logger_id, tag_key, value, data_ts, saved_ts
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [logger_id, tagKey, value, dataTs, savedTs]
      );

      await run(
        db,
        `
        INSERT INTO logger_latest (
          logger_id, tag_key, value, data_ts, saved_ts
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(logger_id, tag_key) DO UPDATE SET
          value = excluded.value,
          data_ts = excluded.data_ts,
          saved_ts = excluded.saved_ts
        `,
        [logger_id, tagKey, value, dataTs, savedTs]
      );

      written.push({
        tag_key: tagKey,
        value,
        unit,
        data_ts: dataTs
      });
    }

    return {
      logger_id,
      source,
      raw_id,
      data_ts: dataTs,
      written
    };
  } finally {
    db.close();
  }
}

module.exports = {
  writeLoggerPayload
};