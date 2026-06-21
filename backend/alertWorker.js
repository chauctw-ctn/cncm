"use strict";

const { openDb } = require("./connection");
const { sendTelegramAlert } = require("./telegramService");

// Biến lưu trữ trạng thái trước đó của các trạm để tránh spam tin nhắn lặp lại
const offlineTracker = new Set();

// 🌟 ĐĂNG KÝ BIẾN TOÀN CỤC: Giúp kiểm tra sức khỏe Worker qua API
global.workerHealth = {
  status: "Khởi tạo",
  last_run_ts: null,
  total_scans: 0
};

console.log("🚀 Tiến trình Worker quét trạm Online/Offline đã kích hoạt ngầm...");

setInterval(() => {
  // Cập nhật trạng thái bắt đầu quét dữ liệu
  global.workerHealth.status = "Đang quét cơ sở dữ liệu...";
  
  const db = openDb();

  // Quét thời gian nhận dữ liệu gần nhất của từng trạm so với thời gian thực tế hiện tại
  const sql = `
    SELECT 
      l.logger_id,
      MAX(l.saved_ts) as last_seen,
      s.display_name
    FROM logger_latest l
    LEFT JOIN logger_tag_mappings m ON l.tag_key = m.parameter_key 
      AND l.logger_id = (m.source || '_' || m.hardware_tag)
    LEFT JOIN logger_stations s ON s.station_id = m.target_station_id
    GROUP BY l.logger_id
  `;

  db.all(sql, [], (err, rows) => {
    db.close();
    if (err) {
      console.error("❌ Worker quét DB lỗi:", err.message);
      global.workerHealth.status = `Lỗi hệ thống: ${err.message}`;
      return;
    }

    if (!rows) {
      global.workerHealth.status = "Trống dữ liệu trạm";
      return;
    }

    // Lấy mốc mốc thời gian thực tế hiện tại theo mili-giây
    const nowMs = Date.now(); 

    rows.forEach(row => {
      if (!row.last_seen) return;
      
      // 🔥 FIX LỖI MÚI GIỜ: Ép chuỗi thời gian SQLite chạy theo giờ nội địa máy tính (Local)
      // Chuyển đổi 'YYYY-MM-DD HH:mm:ss' thành định dạng chuẩn để JS hiểu đúng múi giờ gốc của hệ điều hành
      const formattedDateStr = row.last_seen.replace(/-/g, "/");
      const lastSeenMs = Date.parse(formattedDateStr);
      
      if (isNaN(lastSeenMs)) return; // Chuỗi ngày lỗi thì bỏ qua

      // Tính toán số phút trễ chính xác tuyệt đối
      const diffMinutes = Math.floor((nowMs - lastSeenMs) / 1000 / 60);
      const name = row.display_name || `Mã nguồn [${row.logger_id.toUpperCase()}]`;

      // KỊCH BẢN 1: Nếu dữ liệu muộn quá 15 phút và trạm chưa được đánh dấu là offline trước đó
      if (diffMinutes >= 15 && !offlineTracker.has(row.logger_id)) {
        offlineTracker.add(row.logger_id);
        
        const alertMsg = `🚨 *MẤT TÍN HIỆU THIẾT BỊ*\n📍 *Trạm:* ${name}\n🆔 *Mã nguồn:* \`${row.logger_id}\`\n⚠️ *Trạng thái:* **OFFLINE**\n⏱ *Lần cuối thấy:* ${row.last_seen} (Trễ ${diffMinutes} phút)`;
        sendTelegramAlert(alertMsg);
      } 
      // KỊCH BẢN 2: Nếu thiết bị có dữ liệu mới cập nhật trở lại (Nhỏ hơn 15 phút)
      else if (diffMinutes < 15 && offlineTracker.has(row.logger_id)) {
        offlineTracker.delete(row.logger_id);
        
        const recoverMsg = `✅ *THIẾT BỊ ĐÃ KẾT NỐI LẠI*\n📍 *Trạm:* ${name}\n🆔 *Mã nguồn:* \`${row.logger_id}\`\n🟢 *Trạng thái:* **ONLINE**\n⏱ *Thời gian phục hồi:* ${row.last_seen}`;
        sendTelegramAlert(recoverMsg);
      }
    });

    // 🌟 IN LOG TRỰC TIẾP RA TERMINAL: Giúp bạn biết chắc chắn Worker đang sống tốt
    const timeString = new Date().toLocaleTimeString("vi-VN");
    console.log(`[${timeString}] 🔍 AlertWorker vừa quét xong ${rows.length} trạm. Thiết bị đang lỗi Offline: ${offlineTracker.size}`);

    // Cập nhật thông số Health Check phục vụ API bên ngoài
    global.workerHealth.status = "Chạy ngầm ổn định (Chờ chu kỳ tiếp theo)";
    global.workerHealth.last_run_ts = new Date().toLocaleString("vi-VN");
    global.workerHealth.total_scans += 1;
  });
}, 60000); // 60 giây chạy quét lại 1 lần