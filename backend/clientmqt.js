"use strict";

// Nạp cấu hình biến môi trường từ file .env đầu tiên
require("dotenv").config();

const mqtt = require("mqtt");
const writer = require("./logger-writer");
const { openDb } = require("./connection");

const DEFAULT_CONFIG = {
  host: process.env.MQTT_HOST || "14.225.252.85",
  port: process.env.MQTT_PORT || "1883",
  topic: process.env.MQTT_TOPIC || "telemetry",
  source: process.env.MQTT_SOURCE || "mqtt",
  tzOffsetMinutes: 420, // Múi giờ +7

  // Nạp 2 chu kỳ cấu hình động từ file .env
  FETCH_INTERVAL_SECONDS: Number(process.env.MQTT_FETCH_INTERVAL_SECONDS) || 60,
  SAVE_DB_INTERVAL_MINUTES: Number(process.env.SAVE_DB_INTERVAL_MINUTES) || 5
};

const TAG_PARAMETER_MAP = { 
  MUCNUOC: "level", 
  LUULUONG: "flow", 
  TONGLUULUONG: "totalIndex" 
};

// Khởi tạo kết nối duy nhất và kích hoạt chế độ WAL chống khóa SQLite
const db = openDb();
db.serialize(() => {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA synchronous = NORMAL");
});

// ------------------------------------------------------------------
// CÁC BỘ NHỚ ĐỆM RAM (BUFFER) ĐỂ QUẢN LÝ CHU KỲ
// ------------------------------------------------------------------
let rawPayloadBuffer = null; // Giữ gói tin MQTT thô mới nhất chờ chu kỳ Fetch
const historyCache = {};      // Gom các gói tin sạch chờ chu kỳ lưu DB 5 phút

function buildStationId(source, rawId) { 
  return `${source}_${String(rawId).toLowerCase()}`; 
}

function normalizeMetricValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const cleaned = String(value).replace(/,/g, "").trim();
  const numericValue = Number(cleaned);
  return Number.isNaN(numericValue) ? null : numericValue;
}

function formatTimestampWithOffset(ts, offsetMinutes) {
  if (!ts) return null;
  const parsed = new Date(String(ts).trim().replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (Number.isNaN(parsed.getTime())) return null;

  const adjusted = new Date(parsed.getTime() + offsetMinutes * 60 * 1000);
  const pad = (v) => String(v).padStart(2, "0");

  return `${adjusted.getUTCFullYear()}-${pad(adjusted.getUTCMonth() + 1)}-${pad(adjusted.getUTCDate())} ${pad(adjusted.getUTCHours())}:${pad(adjusted.getUTCMinutes())}:${pad(adjusted.getUTCSeconds())}`;
}

function parsePayloadText(text) {
  try {
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1).replace(/[\u0000-\u001F\u007F]/g, "").replace(/-?nan/gi, "null"));
    }
  } catch (_) {}
  return null;
}

// ------------------------------------------------------------------
// HÀM XỬ LÝ CHUYỂN ĐỔI VÀ ĐẨY DỮ LIỆU VÀO CÁC BỘ ĐỆM
// ------------------------------------------------------------------
function processTelemetryPayload(payload) {
  if (!payload || !Array.isArray(payload.d)) return;
  const formattedTs = formatTimestampWithOffset(payload.ts, DEFAULT_CONFIG.tzOffsetMinutes) || payload.ts;

  payload.d.forEach(async (item) => {
    if (!item || !item.tag) return;
    const parts = String(item.tag).trim().split("_");
    if (parts.length < 2) return;

    const parameter = TAG_PARAMETER_MAP[parts[parts.length - 1].toUpperCase()];
    const value = normalizeMetricValue(item.value);
    if (!parameter || value === null) return;

    const rawId = parts.slice(0, -1).join("").toLowerCase();
    const stationId = buildStationId(DEFAULT_CONFIG.source, rawId);

    // 1. Đẩy vào bộ nhớ đệm RAM lịch sử (Gói mới liên tục đè gói cũ trong chu kỳ 5 phút)
    const cacheKey = `${stationId}|${parameter}`;
    historyCache[cacheKey] = { 
      logger_id: stationId, 
      tag_key: parameter, 
      data_ts: formattedTs, 
      value 
    };

    // 2. CẬP NHẬT NGAY LẬP TỨC CHO API GẦN NHẤT (Bảng logger_latest)
    try {
      await writer.saveLoggerPayload(db, { 
        source: DEFAULT_CONFIG.source, 
        logger_id: stationId, 
        raw_id: rawId, 
        data_ts: formattedTs, 
        [parameter]: value 
      });
    } catch (err) { 
      console.error("[MQTT] Lỗi cập nhật logger_latest:", err.message); 
    }
  });
}

// ------------------------------------------------------------------
// CHU KỲ 1: ĐÚNG SỐ GIÂY TRONG .ENV MỚI FETCH TRÍCH XUẤT ĐỂ ĐỔ API LATEST
// ------------------------------------------------------------------
setInterval(() => {
  if (!rawPayloadBuffer) return;

  console.log(`[SYSTEM][FETCH] Đúng chu kỳ ${DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS}s -> Trích xuất gói tin phục vụ API dữ liệu gần nhất.`);
  
  // Xử lý bóc tách và ghi nhận dữ liệu
  processTelemetryPayload(rawPayloadBuffer);

  // Xóa bộ đệm thô để chờ đón gói tin ở chu kỳ 60s tiếp theo
  rawPayloadBuffer = null;
}, DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS * 1000);

// ------------------------------------------------------------------
// CHU KỲ 2: ĐÚNG SỐ PHÚT TRONG .ENV MỚI GHI BATCH INSERT VÀO LỊCH SỬ DB
// ------------------------------------------------------------------
setInterval(() => {
  const cachedItems = Object.values(historyCache);
  if (cachedItems.length === 0) return;

  // Giải phóng ngay bộ đệm RAM lịch sử để gom dữ liệu chu kỳ mới
  for (const key in historyCache) { delete historyCache[key]; }

  console.log(`\n--- [CƠ CHẾ ${DEFAULT_CONFIG.SAVE_DB_INTERVAL_MINUTES} PHÚT] Ghi đồng loạt ${cachedItems.length} records từ .env vào Lịch sử ---`);

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE TRANSACTION", (err) => {
      if (err) return;
      const stmt = db.prepare(`INSERT INTO logger_readings (logger_id, tag_key, data_ts, value) VALUES (?, ?, ?, ?)`);
      
      cachedItems.forEach((item) => { 
        stmt.run([item.logger_id, item.tag_key, item.data_ts, item.value]); 
      });

      stmt.finalize((e) => e ? db.run("ROLLBACK") : db.run("COMMIT", () => console.log("[DB] Đã ghi nhận lịch sử xuống ổ đĩa thành công.")));
    });
  });
}, DEFAULT_CONFIG.SAVE_DB_INTERVAL_MINUTES * 60 * 1000);

// ------------------------------------------------------------------
// KẾT NỐI VÀ HỨNG DỮ LIỆU THÔ TỪ MQTT BROKER
// ------------------------------------------------------------------
const client = mqtt.connect(`mqtt://${DEFAULT_CONFIG.host}:${DEFAULT_CONFIG.port}`, {
  clean: true, connectTimeout: 10000, reconnectPeriod: 3000
});

client.on("connect", () => {
  console.log(`[MQTT] Kết nối thành công Broker. Chu kỳ Fetch: ${DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS}s | Chu kỳ Lưu: ${DEFAULT_CONFIG.SAVE_DB_INTERVAL_MINUTES}m`);
  client.subscribe(DEFAULT_CONFIG.topic);
});

client.on("message", (topic, payload) => {
  const parsed = parsePayloadText(payload.toString("utf8"));
  if (parsed) {
    // Không xử lý ngay, chỉ găm gói tin thô mới nhất vào RAM biến tạm
    rawPayloadBuffer = parsed;
  }
});

// Tắt DB an toàn khi ứng dụng crash hoặc tắt máy chủ
process.on("SIGINT", () => {
  db.close(() => {
    console.log("[DB] Đã đóng kết nối SQLite an toàn.");
    process.exit(0);
  });
});