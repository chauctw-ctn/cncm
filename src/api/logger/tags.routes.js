"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

// 1. GET: Lấy danh sách tag kèm giá trị mới nhất (Giữ nguyên - Rất tốt)
router.get("/:logger_id", (req, res) => {
  const { logger_id } = req.params;
  const db = openDb();

  db.all(
    `
    SELECT
      t.id, t.logger_id, t.tag_key, t.tag_name, t.unit,
      t.enabled, t.min_value, t.max_value, t.display_order,
      l.value, l.data_ts, l.saved_ts
    FROM logger_tags t
    LEFT JOIN logger_latest l
      ON t.logger_id = l.logger_id AND t.tag_key = l.tag_key
    WHERE t.logger_id = ?
    ORDER BY t.display_order ASC, t.id ASC
    `,
    [logger_id],
    (err, rows) => {
      db.close();
      if (err) return res.status(500).json({ success: false, message: err.message });

      res.json({ success: true, logger_id, data: rows });
    }
  );
});

// 2. POST: Thêm mới hoặc Trích xuất tag từ trạm khác (Đã sửa luồng ON CONFLICT)
router.post("/:logger_id", (req, res) => {
  const { logger_id } = req.params;
  const {
    tag_key,
    tag_name,
    unit = "",
    enabled = 1,
    min_value = null,
    max_value = null,
    display_order = 0
  } = req.body;

  if (!tag_key) {
    return res.status(400).json({ success: false, message: "Thiếu tag_key" });
  }

  const db = openDb();
  db.run(
    `
    INSERT INTO logger_tags (
      logger_id, tag_key, tag_name, unit, enabled, min_value, max_value, display_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(logger_id, tag_key) DO UPDATE SET
      tag_name = excluded.tag_name,
      unit = excluded.unit,
      enabled = excluded.enabled,
      -- Chỉ ghi đè min/max nếu giá trị truyền lên khác null, tránh mất cấu hình cũ khi trích xuất mẫu
      min_value = CASE WHEN excluded.min_value IS NOT NULL THEN excluded.min_value ELSE logger_tags.min_value END,
      max_value = CASE WHEN excluded.max_value IS NOT NULL THEN excluded.max_value ELSE logger_tags.max_value END,
      display_order = excluded.display_order
    `,
    [logger_id, tag_key, tag_name || tag_key, unit, enabled, min_value, max_value, display_order],
    function (err) {
      db.close();
      if (err) return res.status(500).json({ success: false, message: err.message });

      res.json({ success: true, message: "Đã lưu tag", logger_id, tag_key });
    }
  );
});

// 3. PUT: Cập nhật thông số chi tiết của một Tag (Đã loại bỏ COALESCE lỗi)
router.put("/:logger_id/:tag_key", (req, res) => {
  const { logger_id, tag_key } = req.params;
  const { tag_name, unit, enabled, min_value, max_value, display_order } = req.body;

  const db = openDb();
  
  // Loại bỏ hoàn toàn COALESCE và ghi nhận trực tiếp giá trị từ Frontend đẩy lên (kể cả null)
  db.run(
    `
    UPDATE logger_tags
    SET
      tag_name = ?,
      unit = ?,
      enabled = ?,
      min_value = ?,
      max_value = ?,
      display_order = CASE WHEN ? IS NOT NULL THEN ? ELSE display_order END
    WHERE logger_id = ? AND tag_key = ?
    `,
    [
      tag_name, 
      unit, 
      enabled ?? 1, 
      min_value ?? null, 
      max_value ?? null,
      display_order ?? null, display_order ?? 0,
      logger_id, 
      tag_key
    ],
    function (err) {
      db.close();
      if (err) return res.status(500).json({ success: false, message: err.message });

      res.json({ success: true, changed: this.changes, logger_id, tag_key });
    }
  );
});

// 4. DELETE: Xóa cấu hình tag và các dữ liệu liên quan (Giữ nguyên cấu trúc Transaction sạch)
router.delete("/:logger_id/:tag_key", (req, res) => {
  const { logger_id, tag_key } = req.params;
  const db = openDb();

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(`DELETE FROM logger_latest WHERE logger_id = ? AND tag_key = ?`, [logger_id, tag_key]);
    db.run(`DELETE FROM logger_readings WHERE logger_id = ? AND tag_key = ?`, [logger_id, tag_key]);

    db.run(
      `DELETE FROM logger_tags WHERE logger_id = ? AND tag_key = ?`,
      [logger_id, tag_key],
      function (err) {
        if (err) {
          db.run("ROLLBACK");
          db.close();
          return res.status(500).json({ success: false, message: err.message });
        }

        db.run("COMMIT");
        db.close();

        res.json({ success: true, deleted: this.changes, logger_id, tag_key });
      }
    );
  });
});

module.exports = router;