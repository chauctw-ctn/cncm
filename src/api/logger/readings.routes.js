"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

router.get("/latest", (req, res) => {
  const db = openDb();

  db.all(
    `
    SELECT
      p.logger_id,
      p.source,
      p.raw_id,
      p.name,
      p.lat,
      p.lng,
      p.enabled,
      l.tag_key,
      t.tag_name,
      t.unit,
      l.value,
      l.data_ts,
      l.saved_ts
    FROM logger_points p
    LEFT JOIN logger_latest l
      ON p.logger_id = l.logger_id
    LEFT JOIN logger_tags t
      ON l.logger_id = t.logger_id
     AND l.tag_key = t.tag_key
    WHERE p.enabled = 1
    ORDER BY p.source, p.raw_id, t.display_order
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


router.get("/map", (req, res) => {
  const db = openDb();

  // SỬA ĐỔI: Câu lệnh SQL này sử dụng Subquery để tìm giá trị tag_key mới nhất 
  // phát sinh từ chính hệ thống (hoặc bạn có thể bổ sung cột liên kết nếu cần).
  // Trong trường hợp này, ta sẽ ưu tiên lấy giá trị của tag_key đó từ bảng logger_latest.
  db.all(
    `
    SELECT
      p.logger_id,
      p.source,
      p.raw_id,
      p.name,
      p.lat,
      p.lng,
      p.enabled,
      t.tag_key,
      t.tag_name,
      t.unit,
      -- Khắc phục: Nếu trạm hiện tại chưa có dữ liệu tức thời, lấy giá trị mới nhất của tag_key này từ nguồn dữ liệu sensor chung hệ thống
      COALESCE(l.value, (SELECT value FROM logger_latest WHERE tag_key = t.tag_key ORDER BY data_ts DESC LIMIT 1)) AS value,
      COALESCE(l.data_ts, (SELECT data_ts FROM logger_latest WHERE tag_key = t.tag_key ORDER BY data_ts DESC LIMIT 1)) AS data_ts
    FROM logger_points p
    LEFT JOIN logger_tags t
      ON p.logger_id = t.logger_id
     AND t.enabled = 1
    LEFT JOIN logger_latest l
      ON t.logger_id = l.logger_id
     AND t.tag_key = l.tag_key
    WHERE p.enabled = 1
    ORDER BY p.source, p.raw_id, t.display_order
    `,
    [],
    (err, rows) => {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      const map = new Map();

      for (const row of rows) {
        if (!map.has(row.logger_id)) {
          map.set(row.logger_id, {
            logger_id: row.logger_id,
            source: row.source,
            raw_id: row.raw_id,
            name: row.name,
            lat: row.lat,
            lng: row.lng,
            enabled: row.enabled,
            tags: {}
          });
        }

        if (row.tag_key) {
          map.get(row.logger_id).tags[row.tag_key] = {
            tag_key: row.tag_key,
            tag_name: row.tag_name,
            unit: row.unit,
            value: row.value,    // Giá trị đã được COALESCE xử lý từ DB
            data_ts: row.data_ts // Thời gian cập nhật đã được xử lý
          };
        }
      }

      res.json({
        success: true,
        data: Array.from(map.values())
      });
    }
  );
});

router.get("/history", (req, res) => {
  const { logger_id, tag_key, limit = 500 } = req.query;

  if (!logger_id || !tag_key) {
    return res.status(400).json({
      success: false,
      message: "Thiếu logger_id hoặc tag_key"
    });
  }

  const db = openDb();

  db.all(
    `
    SELECT *
    FROM logger_readings
    WHERE logger_id = ?
      AND tag_key = ?
    ORDER BY data_ts DESC
    LIMIT ?
    `,
    [logger_id, tag_key, Number(limit)],
    (err, rows) => {
      db.close();

      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({
        success: true,
        data: rows
      });
    }
  );
});

module.exports = router;