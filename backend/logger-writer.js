"use strict";

async function saveLoggerPayload(db, item) {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO logger_latest (logger_id, tag_key, data_ts, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(logger_id, tag_key) DO UPDATE SET
        data_ts = excluded.data_ts,
        value = excluded.value,
        saved_ts = CURRENT_TIMESTAMP
    `;
    
    // Lọc ra thông số đo hiện tại được truyền vào
    const keys = Object.keys(item);
    const tagKey = keys.find(k => ["level", "flow", "totalIndex", "pH", "amino", "nitrat", "TDS"].includes(k));
    
    if (!tagKey) return resolve(); // Không có thông số đo thì bỏ qua

    db.run(sql, [item.logger_id, tagKey, item.data_ts, item[tagKey]], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Giữ hàm này để tương thích với hàm POST seed mock data của bạn nếu có gọi
async function saveLoggerPayloads(payloads) {
  const { openDb } = require("./connection");
  const db = openDb();
  try {
    for (const item of payloads) {
      await saveLoggerPayload(db, item);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    db.close();
  }
}

// Bổ sung thêm import hàm gửi telegram lên đầu file logger-writer.js
const { sendTelegramAlert } = require("./telegramService");

async function upsertLatest(db, loggerId, tagKey, dataTs, value) {
  // 1. Thực hiện ghi dữ liệu thô vào bảng logger_latest như bình thường
  await run(
    db,
    `
    INSERT INTO logger_latest (logger_id, tag_key, data_ts, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(logger_id, tag_key) DO UPDATE SET
      data_ts = excluded.data_ts,
      value = excluded.value,
      saved_ts = datetime('now', 'localtime')
    `,
    [loggerId, tagKey, dataTs, value]
  );

  // 2. Tiến hành kiểm tra chéo ngưỡng Min/Max của trạm
  db.get(
    `
    SELECT t.min_value, t.max_value, s.display_name 
    FROM alert_thresholds t
    JOIN logger_stations s ON t.station_id = s.station_id
    WHERE t.enabled = 1 AND t.tag_key = ? 
      AND (s.station_id = SUBSTR(?, INSTR(?, '_') + 1))
    `,
    [tagKey, loggerId, loggerId],
    (err, threshold) => {
      if (err || !threshold) return; // Không cài đặt ngưỡng hoặc lỗi thì bỏ qua

      const name = threshold.display_name || loggerId.toUpperCase();
      
      if (threshold.min_value !== null && value < threshold.min_value) {
        sendTelegramAlert(`⚠️ *CẢNH BÁO: VƯỢT NGƯỠNG THẤP*\n📍 *Trạm:* ${name}\n📊 *Thông số:* \`${tagKey}\` đạt **${value}**\n🚨 *Ngưỡng tối thiểu:* ${threshold.min_value}\n⏰ *Thời gian:* ${dataTs}`);
      }
      else if (threshold.max_value !== null && value > threshold.max_value) {
        sendTelegramAlert(`🔥 *CẢNH BÁO: VƯỢT NGƯỠNG CAO*\n📍 *Trạm:* ${name}\n📊 *Thông số:* \`${tagKey}\` đạt **${value}**\n🚨 *Ngưỡng tối đa:* ${threshold.max_value}\n⏰ *Thời gian:* ${dataTs}`);
      }
    }
  );
}

module.exports = { saveLoggerPayload, saveLoggerPayloads };