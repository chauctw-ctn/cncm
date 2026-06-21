"use strict";

require("dotenv").config();
const axios = require("axios");
const writer = require("./logger-writer");
const { openDb } = require("./connection");

const DEFAULT_MONRE_CONFIG = {
  username: process.env.MONRE_USERNAME || "capnuoccamau",
  password: process.env.MONRE_PASSWORD || "Qu@nTr@c2121",
  portalUrl: process.env.MONRE_PORTAL_URL || "https://iot.monre.gov.vn/portal/sharing/rest/generateToken",
  dataUrl: process.env.MONRE_DATA_URL || "https://iot.monre.gov.vn/server/rest/services/Hosted/TNN_BIGDATA_EVENT_NEW/FeatureServer/0/query",
  projectFilter: process.env.MONRE_PROJECT_FILTER || "(congtrinh='CAPNUOCCAMAU1' OR congtrinh='CONGTYCOPHANCAPNUOCC' OR congtrinh='NHAMAYCAPNUOCSO1' OR congtrinh='CAPNUOCCAMAUSO2')",
  timeoutMs: Number(process.env.MONRE_TIMEOUT_MS) || 30000,
  source: "monre",

  // Nạp chu kỳ từ file cấu hình .env
  FETCH_INTERVAL_SECONDS: Number(process.env.MONRE_FETCH_INTERVAL_SECONDS) || 60,
  SAVE_DB_INTERVAL_MINUTES: Number(process.env.SAVE_DB_INTERVAL_MINUTES) || 5
};

const MONRE_PARAMETER_MAP = {
  mucnuoc: "level",
  luuluong: "flow",
  tongluuluong: "totalIndex"
};

const db = openDb();
const monreHistoryCache = {};

let cachedToken = null;
let tokenExpiry = null;

function buildStationId(source, rawId) {
  return `${source}_${String(rawId).toLowerCase()}`;
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function normalizeStationRawId(value) {
  const key = normalizeKey(value).replace(/_/g, "");
  const explicitOverrides = { qt3182gpbtnmt: "qt3", qt1nm12186gpbtnmt: "qt1nm1", qt2nm12186gpbtnmt: "qt2nm1" };
  return explicitOverrides[key] || key;
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseEpoch(value) {
  if (value === null || value === undefined) return null;
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) return new Date(asNumber);
  return null;
}

async function getToken(config) {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    username: config.username,
    password: config.password,
    referer: "https://iot.monre.gov.vn",
    f: "json",
    expiration: 60
  });

  const response = await axios.post(config.portalUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000
  });

  if (response.data && response.data.token) {
    cachedToken = response.data.token;
    tokenExpiry = Date.now() + 60 * 60 * 1000;
    return cachedToken;
  }
  throw new Error("Invalid MONRE token response");
}

// ------------------------------------------------------------------
// CƠ CHẾ CHU KỲ FETCH VÀ CHUẨN HÓA LƯU TRỮ API GẦN NHẤT
// ------------------------------------------------------------------
async function processAndSaveMonreData() {
  try {
    const config = DEFAULT_MONRE_CONFIG;
    const source = config.source || "monre";
    
    const token = await getToken(config);
    const params = { f: "json", where: config.projectFilter, outFields: "*", orderByFields: "thoigiannhan DESC", resultRecordCount: 1000, token };

    const response = await axios.get(config.dataUrl, { params, timeout: config.timeoutMs });
    const features = response.data.features || [];

    features.forEach(async (feature) => {
      const attr = feature.attributes || {};
      const rawStationName = attr.tram || attr.station || "";
      const rawId = normalizeStationRawId(rawStationName);
      const rawParameter = normalizeKey(attr.chiso || attr.parameter || "");
      const parameterName = MONRE_PARAMETER_MAP[rawParameter] || rawParameter;

      if (!rawId || !parameterName) return;

      const receiveTime = parseEpoch(attr.thoigiannhan);
      const measurementTime = parseEpoch(attr.thoigiando);
      const ts = formatTimestamp(receiveTime || measurementTime || new Date());
      const stationId = buildStationId(source, rawId);

      const value = attr.giatri !== null && attr.giatri !== undefined && !Number.isNaN(Number(attr.giatri)) ? Number(attr.giatri) : null;
      if (value === null) return;

      // 1. Lưu thông tin vào RAM Cache đệm lịch sử MONRE chờ chu kỳ 5 phút ghi 1 lần
      const cacheKey = `${stationId}|${parameterName}`;
      monreHistoryCache[cacheKey] = {
        logger_id: stationId,
        tag_key: parameterName,
        data_ts: ts,
        value: value
      };

      // 2. CẬP NHẬT LIÊN TỤC VÀO BẢNG LATEST PHỤC VỤ MAP API
      try {
        await writer.saveLoggerPayload(db, {
          source, logger_id: stationId, raw_id: rawId, name: String(rawStationName).trim(), data_ts: ts, [parameterName]: value
        });
        console.log(`[MONRE][${config.FETCH_INTERVAL_SECONDS}s] Updated Latest -> ${stationId} (${parameterName}: ${value})`);
      } catch (err) {
        console.error("[MONRE] Lỗi ghi logger_latest:", err.message);
      }
    });

  } catch (err) {
    console.error("[MONRE FETCH ERROR]:", err.message || err);
  }
}

// Lặp chu kỳ FETCH trích xuất dữ liệu MONRE dựa theo số giây cấu hình trong .env
let inFlight = false;
setInterval(async () => {
  if (inFlight) return;
  inFlight = true;
  console.log(`\n[SYSTEM][MONRE] Khởi động chu kỳ fetch dữ liệu sau mỗi ${DEFAULT_MONRE_CONFIG.FETCH_INTERVAL_SECONDS}s...`);
  await processAndSaveMonreData();
  inFlight = false;
}, DEFAULT_MONRE_CONFIG.FETCH_INTERVAL_SECONDS * 1000);

// ------------------------------------------------------------------
// CƠ CHẾ GHI LỊCH SỬ BATCH INSERT (MỖI 5 PHÚT)
// ------------------------------------------------------------------
const saveIntervalMs = DEFAULT_MONRE_CONFIG.SAVE_DB_INTERVAL_MINUTES * 60 * 1000;
setInterval(() => {
  const cachedItems = Object.values(monreHistoryCache);
  if (cachedItems.length === 0) return;

  // Giải phóng ngay cache RAM để nhận thông tin chu kỳ mới
  for (const key in monreHistoryCache) { delete monreHistoryCache[key]; }

  console.log(`\n--- [CƠ CHẾ MONRE ${DEFAULT_MONRE_CONFIG.SAVE_DB_INTERVAL_MINUTES} PHÚT] Ghi ${cachedItems.length} dòng lịch sử vào SQLite ---`);

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE TRANSACTION", (err) => {
      if (err) return;
      const stmt = db.prepare(`INSERT INTO logger_readings (logger_id, tag_key, data_ts, value) VALUES (?, ?, ?, ?)`);

      cachedItems.forEach((item) => {
        stmt.run([item.logger_id, item.tag_key, item.data_ts, item.value]);
      });

      stmt.finalize((e) => e ? db.run("ROLLBACK") : db.run("COMMIT", () => console.log("[DB][MONRE] Đã ghi nhận chuỗi lịch sử thành công.")));
    });
  });
}, saveIntervalMs);

module.exports = { processAndSaveMonreData };