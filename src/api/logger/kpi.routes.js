"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

function parseLoggerIds(value) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

function todayRange() {
  const now = new Date();
  const pad = v => String(v).padStart(2, "0");
  const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return {
    start: `${d} 00:00:00`,
    end: `${d} 23:59:59`
  };
}

function monthRange() {
  const now = new Date();
  const pad = v => String(v).padStart(2, "0");
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${pad(m + 1)}-01 00:00:00`;
  const last = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${pad(m + 1)}-${pad(last)} 23:59:59`;
  return { start, end };
}

async function calcKpiFlow(db, loggerIds) {
  if (!loggerIds.length) return { value: 0, items: [] };

  const placeholders = loggerIds.map(() => "?").join(",");

  const rows = await dbAll(
    db,
    `
    SELECT
      l.logger_id,
      p.name,
      l.value,
      l.data_ts
    FROM logger_latest l
    LEFT JOIN logger_points p ON l.logger_id = p.logger_id
    WHERE l.tag_key = 'flow'
      AND l.logger_id IN (${placeholders})
    `,
    loggerIds
  );

  const value = rows.reduce((sum, r) => sum + Number(r.value || 0), 0);

  return { value, items: rows };
}

async function calcTotalByRange(db, loggerIds, start, end) {
  if (!loggerIds.length) return { value: 0, items: [] };

  const placeholders = loggerIds.map(() => "?").join(",");

  const rows = await dbAll(
    db,
    `
    SELECT
      logger_id,
      MIN(value) AS first_value,
      MAX(value) AS last_value,
      MAX(value) - MIN(value) AS total_value
    FROM logger_readings
    WHERE tag_key = 'totalIndex'
      AND logger_id IN (${placeholders})
      AND data_ts BETWEEN ? AND ?
    GROUP BY logger_id
    `,
    [...loggerIds, start, end]
  );

  const value = rows.reduce((sum, r) => sum + Number(r.total_value || 0), 0);

  return { value, items: rows, start, end };
}

router.get("/", async (req, res) => {
  const db = openDb();

  try {
    const rows = await dbAll(db, `SELECT * FROM kpi_configs ORDER BY id DESC`);
    rows.forEach(r => r.logger_ids = parseLoggerIds(r.logger_ids));

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.post("/", async (req, res) => {
  const { kpi_id, kpi_type, name, logger_ids = [], enabled = 1 } = req.body;

  if (!kpi_id || !kpi_type || !Array.isArray(logger_ids)) {
    return res.status(400).json({
      success: false,
      message: "Thiếu kpi_id, kpi_type hoặc logger_ids"
    });
  }

  const tagKey = kpi_type === "kpi-total" ? "totalIndex" : "flow";
  const db = openDb();

  try {
    await dbRun(
      db,
      `
      INSERT INTO kpi_configs (
        kpi_id, kpi_type, name, tag_key, logger_ids, enabled
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(kpi_id) DO UPDATE SET
        kpi_type = excluded.kpi_type,
        name = excluded.name,
        tag_key = excluded.tag_key,
        logger_ids = excluded.logger_ids,
        enabled = excluded.enabled,
        updated_ts = CURRENT_TIMESTAMP
      `,
      [
        kpi_id,
        kpi_type,
        name || kpi_id,
        tagKey,
        JSON.stringify(logger_ids),
        enabled
      ]
    );

    res.json({ success: true, message: "Đã lưu KPI", kpi_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.put("/:kpi_id", async (req, res) => {
  const { kpi_id } = req.params;
  const { kpi_type, name, logger_ids, enabled } = req.body;
  const tagKey = kpi_type === "kpi-total" ? "totalIndex" : kpi_type === "kpi-flow" ? "flow" : null;

  const db = openDb();

  try {
    await dbRun(
      db,
      `
      UPDATE kpi_configs
      SET
        kpi_type = COALESCE(?, kpi_type),
        name = COALESCE(?, name),
        tag_key = COALESCE(?, tag_key),
        logger_ids = COALESCE(?, logger_ids),
        enabled = COALESCE(?, enabled),
        updated_ts = CURRENT_TIMESTAMP
      WHERE kpi_id = ?
      `,
      [
        kpi_type ?? null,
        name ?? null,
        tagKey,
        Array.isArray(logger_ids) ? JSON.stringify(logger_ids) : null,
        enabled ?? null,
        kpi_id
      ]
    );

    res.json({ success: true, message: "Đã cập nhật KPI", kpi_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.delete("/:kpi_id", async (req, res) => {
  const db = openDb();

  try {
    const result = await dbRun(
      db,
      `DELETE FROM kpi_configs WHERE kpi_id = ?`,
      [req.params.kpi_id]
    );

    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.get("/:kpi_id/value", async (req, res) => {
  const db = openDb();

  try {
    const config = await dbGet(
      db,
      `SELECT * FROM kpi_configs WHERE kpi_id = ?`,
      [req.params.kpi_id]
    );

    if (!config) {
      return res.status(404).json({ success: false, message: "Không tìm thấy KPI" });
    }

    const loggerIds = parseLoggerIds(config.logger_ids);

    if (config.kpi_type === "kpi-flow") {
      const result = await calcKpiFlow(db, loggerIds);
      return res.json({
        success: true,
        kpi_id: config.kpi_id,
        kpi_type: config.kpi_type,
        name: config.name,
        value: result.value,
        unit: "m³/h",
        items: result.items
      });
    }

    const today = todayRange();
    const month = monthRange();

    const todayResult = await calcTotalByRange(db, loggerIds, today.start, today.end);
    const monthResult = await calcTotalByRange(db, loggerIds, month.start, month.end);

    res.json({
      success: true,
      kpi_id: config.kpi_id,
      kpi_type: config.kpi_type,
      name: config.name,
      unit: "m³",
      today: todayResult,
      month: monthResult
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

module.exports = router;