"use strict";

const https = require("https");
const { openDb } = require("./connection");

/**
 * Hàm gửi tin nhắn tự động qua Telegram sử dụng dữ liệu từ DB telegram_configs
 * @param {string} message Nội dung tin nhắn cần gửi
 */
exports.sendTelegramAlert = (message) => {
  const db = openDb();
  
  db.get("SELECT bot_token, chat_id, enabled FROM telegram_configs WHERE id = 1", [], (err, cfg) => {
    db.close();
    if (err || !cfg || !cfg.enabled || !cfg.bot_token || !cfg.chat_id) {
      // Bỏ qua nếu cấu hình Telegram tắt hoặc chưa nạp Token/Chat ID
      return; 
    }

    const payload = JSON.stringify({
      chat_id: cfg.chat_id,
      text: message,
      parse_mode: "Markdown"
    });

    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${cfg.bot_token}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      res.on("data", () => {});
    });

    req.on("error", (e) => {
      console.error("❌ Lỗi mạng khi gửi Telegram:", e.message);
    });

    req.write(payload);
    req.end();
  });
};