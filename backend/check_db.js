"use strict";

const { openDb } = require("./connection");
const db = openDb();

console.log("===============================================================");
console.log("🔍 ĐANG KIỂM TRA DỮ LIỆU TRONG DATABASE SQLITE...");
console.log("===============================================================\n");

db.serialize(() => {
  
  // 1. Kiểm tra bảng Số điểm trạm (logger_points)
  db.all("SELECT COUNT(*) as count FROM logger_points", [], (err, rows) => {
    if (err) return console.error("❌ Lỗi đọc bảng logger_points:", err.message);
    console.log(`📌 Tổng số điểm trạm hiện có: ${rows[0].count}`);
  });

  // 2. Kiểm tra bảng Dữ liệu gần nhất (logger_latest)
  db.all("SELECT * FROM logger_latest ORDER BY logger_id, tag_key", [], (err, rows) => {
    if (err) return console.error("❌ Lỗi đọc bảng logger_latest:", err.message);
    
    console.log("\n---------------------------------------------------------------");
    console.log(`📊 BẢNG LOGGER_LATEST (DỮ LIỆU GẦN NHẤT) - Tổng cộng: ${rows.length} records`);
    console.log("---------------------------------------------------------------");
    if (rows.length === 0) {
      console.log("  (Chưa có dữ liệu gần nhất nào được lưu)");
    } else {
      console.table(rows.map(r => ({
        "Trạm (logger_id)": r.logger_id,
        "Thông số (tag_key)": r.tag_key,
        "Giá trị (value)": r.value,
        "Thời gian thiết bị (data_ts)": r.data_ts,
        "Thời gian lưu hệ thống (saved_ts)": r.saved_ts
      })));
    }
  });

  // 3. Kiểm tra bảng Dữ liệu lịch sử (logger_readings) - Lấy 10 dòng mới nhất
  db.all("SELECT * FROM logger_readings ORDER BY id DESC LIMIT 10", [], (err, rows) => {
    if (err) return console.error("❌ Lỗi đọc bảng logger_readings:", err.message);
    
    console.log("\n---------------------------------------------------------------");
    console.log(`📜 BẢNG LOGGER_READINGS (10 BẢN GHI LỊCH SỬ MỚI NHẤT)`);
    console.log("---------------------------------------------------------------");
    if (rows.length === 0) {
      console.log("  (Chưa có dữ liệu lịch sử nào được lưu. Lưu ý: Cơ chế RAM Cache cần 5 phút để ghi)");
    } else {
      console.table(rows.map(r => ({
        "ID": r.id,
        "Trạm (logger_id)": r.logger_id,
        "Thông số (tag_key)": r.tag_key,
        "Giá trị (value)": r.value,
        "Thời gian thiết bị (data_ts)": r.data_ts
      })));
    }
    
    // Đóng kết nối sau khi hoàn thành truy vấn cuối cùng
    db.close(() => {
      console.log("\n===============================================================");
      console.log("🏁 Hoàn tất kiểm tra dữ liệu.");
      console.log("===============================================================");
    });
  });

});