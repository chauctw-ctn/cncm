// "use strict";
// const { openDb } = require("./connection");

// const db = openDb();

// // Tạo hẳn một bản ghi mới tinh độc lập hoàn toàn, thời gian nhận dữ liệu bị trễ 30 phút trước
// const sql = `
//   INSERT INTO logger_latest (logger_id, tag_key, data_ts, value, saved_ts)
//   VALUES ('mqtt_qt2_test_offline', 'level', '2026-06-21 21:20:00', 26.13, datetime('now', '-30 minutes'))
//   ON CONFLICT(logger_id, tag_key) DO UPDATE SET
//     saved_ts = datetime('now', '-30 minutes')
// `;

// db.run(sql, [], (err) => {
//   db.close();
//   if (err) {
//     console.error("❌ Lỗi cấu hình DB:", err.message);
//   } else {
//     console.log("🟢 THÀNH CÔNG: Đã nạp trạm giả lập [mqtt_qt2_test_offline] bị trễ 30 phút.");
//     console.log("👉 Hãy mở API kiểm tra ngay xem trạm mới xuất hiện chưa!");
//   }
// });

"use strict";
const { openDb } = require("./connection");
const db = openDb();

db.serialize(() => {
  db.run("CREATE INDEX IF NOT EXISTS idx_logger_latest_lookup ON logger_latest (logger_id, tag_key, saved_ts);");
  db.run("CREATE INDEX IF NOT EXISTS idx_history_lookup ON logger_history (logger_id, tag_key, data_ts);", [], (err) => {
    db.close();
    if (err) {
      console.error("❌ Lỗi tạo Index:", err.message);
    } else {
      console.log("🟢 Tuyệt vời! Đã nạp thành công các chỉ mục Index vào file DB hiện tại.");
    }
  });
});