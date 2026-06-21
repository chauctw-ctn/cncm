"use strict";

const { openDb } = require("./connection");
const fs = require("fs");
const path = require("path");

// Đảm bảo thư mục dữ liệu tồn tại
const dataDir = path.resolve(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = openDb();

db.serialize(() => {
  console.log("🛠 Khởi động quá trình dọn sạch và làm mới Database...");

  // 1. Tạm thời tắt kiểm tra khóa ngoại để thực hiện dọn dẹp sạch sẽ
  db.run("PRAGMA foreign_keys = OFF");

  // 2. Xóa các bảng cũ (Đã bổ sung xóa các bảng cấu hình mở rộng)
  db.run("DROP TABLE IF EXISTS logger_tag_mappings");
  db.run("DROP TABLE IF EXISTS logger_stations");
  db.run("DROP TABLE IF EXISTS logger_latest");
  db.run("DROP TABLE IF EXISTS logger_readings");
  db.run("DROP TABLE IF EXISTS alert_thresholds");
  db.run("DROP TABLE IF EXISTS telegram_configs");
  db.run("DROP TABLE IF EXISTS users");

  console.log("🗑 Đã xóa sạch cấu trúc dữ liệu và các bảng cũ.");

  // 3. Kích hoạt lại ràng buộc khóa ngoại
  db.run("PRAGMA foreign_keys = ON");

  // 4. Tạo bảng TRẠM HIỂN THỊ (Map Stations)
  db.run(`
    CREATE TABLE logger_stations (
      station_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      lat REAL,
      lng REAL,
      description TEXT
    )
  `);

  // 5. Tạo bảng MAPPING TAG (Ánh xạ đa nguồn về trạm hiển thị)
  db.run(`
    CREATE TABLE logger_tag_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      hardware_tag TEXT NOT NULL,
      parameter_key TEXT NOT NULL,
      target_station_id TEXT NOT NULL,
      FOREIGN KEY (target_station_id) REFERENCES logger_stations(station_id) ON DELETE CASCADE,
      UNIQUE(source, hardware_tag, parameter_key)
    )
  `);

  // 6. Tạo bảng DỮ LIỆU GẦN NHẤT (Logger Latest)
  db.run(`
    CREATE TABLE logger_latest (
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      data_ts TEXT NOT NULL,
      value REAL,
      saved_ts TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (logger_id, tag_key)
    )
  `);

  // 7. Tạo bảng DỮ LIỆU LỊCH SỬ (Logger Readings)
  db.run(`
    CREATE TABLE logger_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logger_id TEXT NOT NULL,
      tag_key TEXT NOT NULL,
      data_ts TEXT NOT NULL,
      value REAL
    )
  `);

  // ==================== BẢNG MỚI BỔ SUNG ====================

  // 1. Cấu hình ngưỡng Min/Max cho từng Tag của Trạm hiển thị
  db.run(`CREATE TABLE alert_thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    tag_key TEXT NOT NULL,
    min_value REAL,
    max_value REAL,
    enabled INTEGER DEFAULT 1,
    FOREIGN KEY(station_id) REFERENCES logger_stations(station_id) ON DELETE CASCADE,
    UNIQUE(station_id, tag_key)
  )`);

  // 2. Cấu hình Telegram (Mặc định nạp sẵn 1 dòng để người dùng sửa qua API)
  db.run(`CREATE TABLE telegram_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_token TEXT,
    chat_id TEXT,
    enabled INTEGER DEFAULT 1
  )`);
  db.run("INSERT INTO telegram_configs (id, bot_token, chat_id, enabled) VALUES (1, '', '', 0)");

  // 3. Quản lý tài khoản User
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'operator',
    created_ts TEXT DEFAULT (datetime('now', 'localtime'))
  )`);

  // ==================== KHỞI TẠO CHỈ MỤC (INDEXES) ====================

  // Tối ưu cho alertWorker.js và API latest (Quét trạm nhanh gấp 10-100 lần)
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_logger_latest_lookup 
    ON logger_latest (logger_id, tag_key, saved_ts);
  `);

  // 🔥 FIX LỖI: Đổi từ logger_history sang logger_readings cho chuẩn nhất quán cấu hình
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_history_lookup 
    ON logger_readings (logger_id, tag_key, data_ts);
  `);

  console.log("✅ Cấu trúc DB hoàn toàn trống rỗng và các Chỉ mục (Indexes) đã khởi tạo thành công!");
  console.log("🏁 Chạy thành công. Bạn có thể bật lại server.");
});

// Đóng kết nối an toàn sau khi chuỗi serialize hoàn tất
db.close();