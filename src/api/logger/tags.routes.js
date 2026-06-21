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
// 2. POST: Thêm mới hoặc Trích xuất tag từ trạm khác sang trạm đang chọn
router.post("/", (req, res) => {
  const {
    logger_id,     // Đây là ID của TRẠM ĐANG CHỌN (Trạm mục tiêu)
    tag_key,
    tag_name,
    unit,
    enabled = 1,
    min_value = null,
    max_value = null,
    display_order = 0
  } = req.body;

  if (!logger_id || !tag_key) {
    return res.status(400).json({
      success: false,
      message: "Thiếu thông tin logger_id (Trạm mục tiêu) hoặc tag_key"
    });
  }

  const db = openDb();

  // Sử dụng INSERT OR REPLACE hoặc ON CONFLICT để đảm bảo nếu trạm mục tiêu đã có tag này thì cập nhật, chưa có thì thêm mới
  db.run(
    `
    INSERT INTO logger_tags (
      logger_id, tag_key, tag_name, unit, enabled, min_value, max_value, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(logger_id, tag_key) DO UPDATE SET
      tag_name = excluded.tag_name,
      unit = excluded.unit,
      enabled = excluded.enabled,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      display_order = excluded.display_order
    `,
    [
      logger_id, // Gắn chính xác vào ID của trạm mục tiêu đang thao tác
      tag_key.trim(),
      tag_name ? tag_name.trim() : tag_key.trim(),
      unit ? unit.trim() : "",
      enabled ?? 1,
      min_value === "" ? null : min_value,
      max_value === "" ? null : max_value,
      display_order ?? 0
    ],
    function (err) {
      db.close();
      if (err) {
        return res.status(500).json({ success: false, message: err.message });
      }

      res.json({
        success: true,
        message: "Trích xuất và thêm tag thành công",
        data: { logger_id, tag_key }
      });
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