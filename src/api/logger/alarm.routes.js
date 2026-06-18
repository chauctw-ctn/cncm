"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

router.get("/active", (req, res) => {
  const db = openDb();

  db.all(
    `
    SELECT
      th.logger_id,
      th.tag_key,
      th.min_value,
      th.max_value,
      th.warning_enabled,
      th.message,

      p.name AS logger_name,
      p.source,
      p.raw_id,

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
    LEFT JOIN logger_points p
      ON th.logger_id = p.logger_id
    LEFT JOIN logger_tags t
      ON th.logger_id = t.logger_id
     AND th.tag_key = t.tag_key
    LEFT JOIN logger_latest l
      ON th.logger_id = l.logger_id
     AND th.tag_key = l.tag_key
    WHERE th.warning_enabled = 1
      AND l.value IS NOT NULL
      AND (
        (
          th.min_value IS NOT NULL
          AND l.value < th.min_value
        )
        OR
        (
          th.max_value IS NOT NULL
          AND l.value > th.max_value
        )
      )
    ORDER BY l.data_ts DESC
    `,
    [],
    (err, rows) => {
      db.close();

      if (err) {
        return res.status(500).json({
          success: false,
          message: err.message
        });
      }

      res.json({
        success: true,
        total: rows.length,
        data: rows
      });
    }
  );
});

module.exports = router;