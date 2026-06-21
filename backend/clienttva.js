"use strict";

require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const writer = require("./logger-writer");
const { openDb } = require("./connection");

const DEFAULT_TVA_CONFIG = {
  baseUrl: process.env.TVA_URL || "http://camau.dulieuquantrac.com:8906",
  loginUrl: process.env.TVA_LOGIN_URL || "http://camau.dulieuquantrac.com:8906/index.php?module=users&view=users&task=checklogin",
  username: process.env.TVA_USERNAME || "ctncamau@quantrac.net",
  password: process.env.TVA_PASSWORD || "123456789",
  loginPath: process.env.TVA_LOGIN_PATH || "/dang-nhap/",
  timeoutMs: Number(process.env.TVA_TIMEOUT_MS) || 15000,
  maxRetries: Number(process.env.TVA_MAX_RETRIES) || 3,
  retryDelayMs: Number(process.env.TVA_RETRY_DELAY_MS) || 5000,
  source: "tva",

  // Đọc chu kỳ đồng bộ từ cấu hình .env
  FETCH_INTERVAL_SECONDS: Number(process.env.TVA_FETCH_INTERVAL_SECONDS) || 60,
  SAVE_DB_INTERVAL_MINUTES: Number(process.env.SAVE_DB_INTERVAL_MINUTES) || 5
};

const TVA_PARAMETER_MAP = {
  mucnuoc: "level",
  luuluong: "flow",
  tongluuluong: "totalIndex"
};

// Sử dụng chung kết nối DB có cấu hình chế độ WAL chống nghẽn ghi
const db = openDb();
const tvaHistoryCache = {};

function buildStationId(source, rawId) {
  return `${source}_${String(rawId).toLowerCase()}`;
}

function createHttpClient(config) {
  return axios.create({
    timeout: config.timeoutMs,
    maxRedirects: 5,
    validateStatus: (status) => status < 400,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8"
    }
  });
}

function buildCookieHeader(cookies) {
  const cookieMap = {};
  cookies.forEach((cookie) => {
    const [nameValue] = cookie.split(";");
    const [name, value] = nameValue.split("=");
    if (name && value) cookieMap[name.trim()] = value.trim();
  });
  return Object.entries(cookieMap).map(([name, value]) => `${name}=${value}`).join("; ");
}

function normalizeNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value !== "string") return value;

  let cleaned = value.trim();
  if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;

  if (cleaned.includes(".") && cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/,/g, ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const asNumber = Number(cleaned);
  return Number.isNaN(asNumber) ? null : asNumber;
}

function parseUpdateTime(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, day, month, year, hours = "0", minutes = "0", seconds = "0"] = match;
  const pad = (v) => String(v).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function normalizeStationId(name) {
  const normalized = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const compactKey = normalized.replace(/[^a-z0-9]+/g, "");

  const explicitOverrides = { qt3182gpbtnmt: "qt3", qt1nm12186gpbtnmt: "qt1nm1", qt2nm12186gpbtnmt: "qt2nm1" };
  if (explicitOverrides[compactKey]) return explicitOverrides[compactKey];

  const compact = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const tramBomMatch = compact.match(/^tram_bom_(\d+)$/);
  if (tramBomMatch) return `tb${tramBomMatch[1]}`;

  const nhaMayMatch = compact.match(/^nha_may_so_(\d+)_gieng_so_(\d+)$/);
  if (nhaMayMatch) return `gs${nhaMayMatch[2]}nm${nhaMayMatch[1]}`;

  const qtNmMatch = compact.match(/^qt(\d+)_nm(\d+)$/);
  if (qtNmMatch) return `qt${qtNmMatch[1]}nm${qtNmMatch[2]}`;

  const qtMatch = compact.match(/^qt(\d+)$/);
  if (qtMatch) return `qt${qtMatch[1]}`;

  return compact.replace(/_/g, "");
}

function normalizeParameterName(name) {
  const normalized = normalizeStationId(name);
  return TVA_PARAMETER_MAP[normalized] || null;
}

async function loginTVA(config) {
  const client = createHttpClient(config);
  const loginPageRes = await client.get(config.baseUrl);
  let cookies = loginPageRes.headers["set-cookie"] || [];

  const $login = cheerio.load(loginPageRes.data);
  const formToken = $login("input[name='is_dtool_form']").val();

  const loginData = new URLSearchParams({
    "fields[email]": config.username, "fields[password]": config.password,
    remember_account: "on", is_dtool_form: formToken || ""
  });

  const loginRes = await client.post(`${config.baseUrl}${config.loginPath}`, loginData.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: buildCookieHeader(cookies), Referer: config.baseUrl }
  });

  if (loginRes.headers["set-cookie"]) cookies = [...cookies, ...loginRes.headers["set-cookie"]];
  return { client, cookieHeader: buildCookieHeader(cookies) };
}

// ------------------------------------------------------------------
// CƠ CHẾ CHU KỲ FETCH DỮ LIỆU TỪ WEB TVA ĐỂ ĐẨY VÀO LATEST API
// ------------------------------------------------------------------
async function fetchTVAData(overrides = {}) {
  const config = { ...DEFAULT_TVA_CONFIG, ...overrides };
  const source = config.source || "tva";
  const { client, cookieHeader } = await loginTVA(config);

  const res = await client.get(config.baseUrl, { headers: { Cookie: cookieHeader, Referer: config.baseUrl } });
  const $ = cheerio.load(res.data);
  const fetchedAt = new Date();

  $(".segmentData").each((index, segment) => {
    const $segment = $(segment);
    const stationName = $segment.find(".headerChart").first().text().trim();
    const updateTime = $segment.find(".headerNow").first().text().replace(/Thoi\s*diem:|Thời\s*điểm:/gi, "").trim();

    const rawId = normalizeStationId(stationName);
    const stationId = buildStationId(source, rawId);
    const ts = parseUpdateTime(updateTime) || fetchedAt.toISOString().replace('T', ' ').substring(0, 19);

    $segment.find(".left .table .row").each(async (_, row) => {
      const $row = $(row);
      if ($row.hasClass("header")) return;

      const cols = $row.find(".col");
      if (cols.length < 4) return;

      const name = $(cols[1]).text().trim();
      const valueText = $(cols[3]).text().trim();
      const parameter = normalizeParameterName(name);
      const parsedValue = normalizeNumber(valueText);

      if (!parameter || parsedValue === null) return;

      // 1. Đẩy vào RAM Cache đệm lịch sử, chờ hết chu kỳ 5 phút ghi 1 lần
      const cacheKey = `${stationId}|${parameter}`;
      tvaHistoryCache[cacheKey] = {
        logger_id: stationId,
        tag_key: parameter,
        data_ts: ts,
        value: parsedValue
      };

      // 2. CẬP NHẬT TRỰC TIẾP LÊN BẢNG LATEST PHỤC VỤ MAP API
      try {
        await writer.saveLoggerPayload(db, {
          source, logger_id: stationId, raw_id: rawId, name: stationName, data_ts: ts, [parameter]: parsedValue
        });
        console.log(`[TVA][${config.FETCH_INTERVAL_SECONDS}s] Updated Latest -> ${stationId} (${parameter}: ${parsedValue})`);
      } catch (err) {
        console.error("[TVA] Lỗi ghi logger_latest:", err.message);
      }
    });
  });
}

// Lặp chu kỳ FETCH theo số giây cài đặt trong .env
let inFlight = false;
setInterval(async () => {
  if (inFlight) return;
  inFlight = true;
  console.log(`\n[SYSTEM][TVA] Khởi động chu kỳ fetch dữ liệu sau mỗi ${DEFAULT_TVA_CONFIG.FETCH_INTERVAL_SECONDS}s...`);
  try {
    await fetchTVAData();
  } catch (error) {
    console.error("[TVA FETCH ERROR]:", error.message || error);
  } finally {
    inFlight = false;
  }
}, DEFAULT_TVA_CONFIG.FETCH_INTERVAL_SECONDS * 1000);

// ------------------------------------------------------------------
// CƠ CHẾ GHI LỊCH SỬ ĐỒNG LOẠT (BẢNG LOGGER_READINGS - MỖI 5 PHÚT)
// ------------------------------------------------------------------
const saveIntervalMs = DEFAULT_TVA_CONFIG.SAVE_DB_INTERVAL_MINUTES * 60 * 1000;
setInterval(() => {
  const cachedItems = Object.values(tvaHistoryCache);
  if (cachedItems.length === 0) return;

  // Giải phóng ngay cache RAM để nhận thông tin chu kỳ mới
  for (const key in tvaHistoryCache) { delete tvaHistoryCache[key]; }

  console.log(`\n--- [CƠ CHẾ TVA ${DEFAULT_TVA_CONFIG.SAVE_DB_INTERVAL_MINUTES} PHÚT] Ghi ${cachedItems.length} dòng lịch sử vào SQLite ---`);

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE TRANSACTION", (err) => {
      if (err) return;
      const stmt = db.prepare(`INSERT INTO logger_readings (logger_id, tag_key, data_ts, value) VALUES (?, ?, ?, ?)`);

      cachedItems.forEach((item) => {
        stmt.run([item.logger_id, item.tag_key, item.data_ts, item.value]);
      });

      stmt.finalize((e) => e ? db.run("ROLLBACK") : db.run("COMMIT", () => console.log("[DB][TVA] Đã ghi nhận chuỗi lịch sử thành công.")));
    });
  });
}, saveIntervalMs);

module.exports = { fetchTVAData };