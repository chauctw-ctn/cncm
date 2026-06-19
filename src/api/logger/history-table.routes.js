"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function parseInterval(value) {
  const raw = String(value || "5m").toLowerCase();

  if (raw.endsWith("m")) return Number(raw.replace("m", "")) || 5;
  if (raw.endsWith("h")) return (Number(raw.replace("h", "")) || 1) * 60;
  if (raw.endsWith("d")) return (Number(raw.replace("d", "")) || 1) * 1440;

  return 5;
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function parseDateTime(value) {
  if (!value) return null;
  return new Date(String(value).replace(" ", "T"));
}

function pad(v) {
  return String(v).padStart(2, "0");
}

function formatDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function roundDateToBucket(dateValue, intervalMinutes) {
  const d = parseDateTime(dateValue);
  if (!d || Number.isNaN(d.getTime())) return dateValue;

  d.setSeconds(0);
  d.setMilliseconds(0);

  const totalMinutes = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.floor(totalMinutes / intervalMinutes) * intervalMinutes;

  d.setHours(Math.floor(rounded / 60));
  d.setMinutes(rounded % 60);

  return formatDateTime(d);
}

router.get("/table", async (req, res) => {
  const {
    from,
    to,
    interval = "5m",
    logger_ids,
    tag_keys,
    source,
    limit = 50000
  } = req.query;

  const intervalMinutes = parseInterval(interval);

  const where = [];
  const params = [];

  if (from) {
    where.push("r.data_ts >= ?");
    params.push(from);
  }

  if (to) {
    where.push("r.data_ts <= ?");
    params.push(to);
  }

  const sourceList = parseList(source);
  if (sourceList.length) {
    where.push(`p.source IN (${sourceList.map(() => "?").join(",")})`);
    params.push(...sourceList);
  }

  const loggerList = parseList(logger_ids);
  if (loggerList.length) {
    where.push(`r.logger_id IN (${loggerList.map(() => "?").join(",")})`);
    params.push(...loggerList);
  }

  const tagList = parseList(tag_keys);
  if (tagList.length) {
    where.push(`r.tag_key IN (${tagList.map(() => "?").join(",")})`);
    params.push(...tagList);
  }

  const sql = `
    SELECT
      r.logger_id,
      p.name AS logger_name,
      p.source,
      r.tag_key,
      t.tag_name,
      t.unit,
      r.value,
      r.data_ts
    FROM logger_readings r
    LEFT JOIN logger_points p
      ON r.logger_id = p.logger_id
    LEFT JOIN logger_tags t
      ON r.logger_id = t.logger_id
     AND r.tag_key = t.tag_key
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY r.data_ts DESC
    LIMIT ?
  `;

  params.push(Number(limit));

  const db = openDb();

  try {
    const rawRows = await all(db, sql, params);

    const loggerMap = new Map();
    const bucketMap = new Map();

    for (const row of rawRows) {
      const bucket = roundDateToBucket(row.data_ts, intervalMinutes);

      if (!loggerMap.has(row.logger_id)) {
        loggerMap.set(row.logger_id, {
          logger_id: row.logger_id,
          logger_name: row.logger_name || row.logger_id,
          source: row.source,
          tags: new Map()
        });
      }

      loggerMap.get(row.logger_id).tags.set(row.tag_key, {
        tag_key: row.tag_key,
        tag_name: row.tag_name || row.tag_key,
        unit: row.unit || ""
      });

      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, { ts: bucket });
      }

      const bucketRow = bucketMap.get(bucket);

      if (!bucketRow[row.logger_id]) {
        bucketRow[row.logger_id] = {};
      }

      if (!bucketRow[row.logger_id][row.tag_key]) {
        bucketRow[row.logger_id][row.tag_key] = {
          value: row.value,
          data_ts: row.data_ts,
          unit: row.unit || ""
        };
      }
    }

    const columns = Array.from(loggerMap.values()).map(logger => ({
      logger_id: logger.logger_id,
      logger_name: logger.logger_name,
      source: logger.source,
      tags: Array.from(logger.tags.values())
    }));

    const rows = Array.from(bucketMap.values())
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

    res.json({
      success: true,
      filters: {
        from: from || null,
        to: to || null,
        interval,
        interval_minutes: intervalMinutes,
        logger_ids: loggerList,
        tag_keys: tagList,
        source: sourceList
      },
      total_raw_rows: rawRows.length,
      total_rows: rows.length,
      columns,
      rows
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    db.close();
  }
});

module.exports = router;