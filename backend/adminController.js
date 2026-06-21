"use strict";

const { openDb } = require("./connection");
const crypto = require("crypto"); // Module mã hóa mặc định của Node.js làm hàm hash pass nhanh

// Hàm băm mật khẩu bảo mật cơ bản (Không cần cài thư viện nặng)
const hashPassword = (password) => crypto.createHash("sha256").update(password).digest("hex");

// ===================================================================
// A. QUẢN LÝ NGƯỜI DÙNG (USER CRUD)
// ===================================================================
exports.getUsers = (req, res) => {
  const db = openDb();
  db.all("SELECT id, username, full_name, role, created_ts FROM users", [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
};

// Đã nâng cấp lên dạng Upsert: Trùng username sẽ tự động cập nhật password/họ tên mới thay vì báo lỗi
exports.createUser = (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: "Thiếu tài khoản hoặc mật khẩu!" });

  const db = openDb();
  const sql = `
    INSERT INTO users (username, password_hash, full_name, role) 
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      full_name = excluded.full_name,
      role = excluded.role
  `;

  db.run(
    sql,
    [username.toLowerCase().trim(), hashPassword(password), full_name || "", role || "operator"],
    function(err) {
      db.close();
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: "Đã đồng bộ thông tin tài khoản thành viên thành công!" });
    }
  );
};

exports.deleteUser = (req, res) => {
  const db = openDb();
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "Đã xóa tài khoản khỏi hệ thống." });
  });
};

// ===================================================================
// B. CẤU HÌNH NGƯỠNG CẢNH BÁO (ALERT THRESHOLDS)
// ===================================================================
exports.getThresholds = (req, res) => {
  const db = openDb();
  db.all("SELECT * FROM alert_thresholds", [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows });
  });
};

exports.upsertThreshold = (req, res) => {
  const { station_id, tag_key, min_value, max_value, enabled } = req.body;
  if (!station_id || !tag_key) return res.status(400).json({ success: false, error: "Thiếu mã trạm hoặc mã thông số cảm biến!" });

  const db = openDb();
  const sql = `
    INSERT INTO alert_thresholds (station_id, tag_key, min_value, max_value, enabled)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(station_id, tag_key) DO UPDATE SET
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      enabled = excluded.enabled
  `;

  db.run(sql, [station_id.toLowerCase().trim(), tag_key.trim(), min_value, max_value, enabled ?? 1], function(err) {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: `Đồng bộ cấu hình ngưỡng thành công cho trạm [${station_id}]` });
  });
};

// 🌟 DÒNG MỚI BỔ SUNG: Giải quyết lỗi Crash lội ngược dòng cho app.js
exports.deleteThreshold = (req, res) => {
  const { id } = req.params;
  const db = openDb();
  db.run("DELETE FROM alert_thresholds WHERE id = ?", [id], function(err) {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: "Đã xóa quy tắc cảnh báo thành công." });
  });
};

// ===================================================================
// C. CẤU HÌNH TELEGRAM BOT (SETTINGS)
// ===================================================================
exports.updateTelegramConfig = (req, res) => {
  const { bot_token, chat_id, enabled } = req.body;
  const db = openDb();
  
  db.run(
    "UPDATE telegram_configs SET bot_token = ?, chat_id = ?, enabled = ? WHERE id = 1",
    [bot_token.trim(), chat_id.trim(), enabled ? 1 : 0],
    function(err) {
      db.close();
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: "Đã lưu lại thông số kết nối Telegram Bot thành công!" });
    }
  );
};

// Xem cấu hình Telegram Bot hiện tại
exports.getTelegramConfig = (req, res) => {
  const db = openDb();
  db.get("SELECT id, bot_token, chat_id, enabled FROM telegram_configs WHERE id = 1", [], (err, row) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: row || {} });
  });
};