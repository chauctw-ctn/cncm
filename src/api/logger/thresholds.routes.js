"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

router.get("/", (req, res) => {
  const db = openDb();

  db.all(
    `
    SELECT
      th.*,
      p.name AS logger_name,
      t.tag_name,
      t.unit,
      l.value,
      l.data_ts,
      CASE
        WHEN th.warning_enabled = 1
         AND th.min_value IS NOT NULL
         AND l.value < th.min_value THEN 'LOW'
        WHEN th.warning_enabled = 1
         AND th.max_value IS NOT NULL
         AND l.value > th.max_value THEN 'HIGH'
        ELSE 'OK'
      END AS status
    FROM tag_thresholds th
    LEFT JOIN logger_points p ON th.logger_id = p.logger_id
    LEFT JOIN logger_tags t
      ON th.logger_id = t.logger_id
     AND th.tag_key = t.tag_key
    LEFT JOIN logger_latest l
      ON th.logger_id = l.logger_id
     AND th.tag_key = l.tag_key
    ORDER BY th.logger_id, th.tag_key
    `,
    [],
    (err, rows) => {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({ success: true, data: rows });
    }
  );
});

router.get("/:logger_id/:tag_key", (req, res) => {
  const db = openDb();

  db.get(
    `SELECT * FROM tag_thresholds WHERE logger_id = ? AND tag_key = ?`,
    [req.params.logger_id, req.params.tag_key],
    (err, row) => {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({ success: true, data: row || null });
    }
  );
});

router.post("/", (req, res) => {
  const {
    logger_id,
    tag_key,
    min_value = null,
    max_value = null,
    warning_enabled = 1,
    message = ""
  } = req.body;

  if (!logger_id || !tag_key) {
    return res.status(400).json({
      success: false,
      message: "Thiếu logger_id hoặc tag_key"
    });
  }

  const db = openDb();

  db.run(
    `
    INSERT INTO tag_thresholds (
      logger_id, tag_key, min_value, max_value, warning_enabled, message
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(logger_id, tag_key) DO UPDATE SET
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      warning_enabled = excluded.warning_enabled,
      message = excluded.message
    `,
    [
      logger_id,
      tag_key,
      min_value,
      max_value,
      warning_enabled,
      message
    ],
    function (err) {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({
        success: true,
        message: "Đã lưu ngưỡng cảnh báo",
        logger_id,
        tag_key
      });
    }
  );
});

router.put("/:logger_id/:tag_key", (req, res) => {
  const {
    min_value,
    max_value,
    warning_enabled,
    message
  } = req.body;

  const db = openDb();

  db.run(
    `
    UPDATE tag_thresholds
    SET
      min_value = COALESCE(?, min_value),
      max_value = COALESCE(?, max_value),
      warning_enabled = COALESCE(?, warning_enabled),
      message = COALESCE(?, message)
    WHERE logger_id = ?
      AND tag_key = ?
    `,
    [
      min_value ?? null,
      max_value ?? null,
      warning_enabled ?? null,
      message ?? null,
      req.params.logger_id,
      req.params.tag_key
    ],
    function (err) {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({ success: true, changed: this.changes });
    }
  );
});

router.delete("/:logger_id/:tag_key", (req, res) => {
  const db = openDb();

  db.run(
    `DELETE FROM tag_thresholds WHERE logger_id = ? AND tag_key = ?`,
    [req.params.logger_id, req.params.tag_key],
    function (err) {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({ success: true, deleted: this.changes });
    }
  );
});

module.exports = router;