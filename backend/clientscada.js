"use strict";

require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const writer = require("./logger-writer");
const { openDb } = require("./connection");

const DEFAULT_CONFIG = {
  baseUrl: process.env.SCADA_URL || "http://14.161.36.253:86",
  loginUrl: process.env.SCADA_LOGIN_URL || "http://14.161.36.253:86/Scada/Login.aspx",
  username: process.env.SCADA_USERNAME || "cncamau",
  password: process.env.SCADA_PASSWORD || "cm123456",
  viewId: Number(process.env.SCADA_VIEW_ID) || 16,
  timeoutMs: Number(process.env.SCADA_TIMEOUT_MS) || 15000,
  source: "scada",
  
  // Đọc cấu hình chu kỳ từ file .env
  FETCH_INTERVAL_SECONDS: Number(process.env.SCADA_FETCH_INTERVAL_SECONDS) || 60,
  SAVE_DB_INTERVAL_MINUTES: Number(process.env.SAVE_DB_INTERVAL_MINUTES) || 5
};

const cnlMapping = {
  2902: ["gs4nm2", "level"], 2904: ["gs4nm2", "flow"], 2905: ["gs4nm2", "totalIndex"],
  2907: ["gs5nm1", "level"], 2909: ["gs5nm1", "flow"], 2910: ["gs5nm1", "totalIndex"],
  2912: ["gs4nm1", "level"], 2914: ["gs4nm1", "flow"], 2915: ["gs4nm1", "totalIndex"],
  2917: ["tb1", "level"],    2919: ["tb1", "flow"],    2920: ["tb1", "totalIndex"],
  2922: ["tb24", "amino"],   2923: ["tb24", "level"],   2925: ["tb24", "nitrat"], 2926: ["tb24", "pH"], 2927: ["tb24", "TDS"],
  2928: ["gs5nm1", "amino"], 2929: ["gs5nm1", "nitrat"], 2930: ["gs5nm1", "pH"], 2931: ["gs5nm1", "TDS"],
  2932: ["gs4nm2", "amino"], 2933: ["gs4nm2", "nitrat"], 2934: ["gs4nm2", "pH"], 2935: ["gs4nm2", "TDS"]
};

// Sử dụng chung kết nối DB đã bật WAL nâng cao năng lực chịu tải đa tiến trình
const db = openDb();
const scadaHistoryCache = {};

function buildStationId(source, rawId) {
  return `${source}_${String(rawId).toLowerCase()}`;
}

function mapCnlToStationAndParameter(cnlNum) {
  const mapped = cnlMapping[cnlNum];
  if (!mapped) return { station: null, parameter: null };
  const [station, parameter] = mapped;
  return { station, parameter };
}

function buildCurCnlUrl(config) {
  const params = new URLSearchParams({ cnlNums: " ", viewIDs: " ", viewID: String(config.viewId), _: String(Date.now()) });
  return `${config.baseUrl}/Scada/ClientApiSvc.svc/GetCurCnlDataExt?${params}`;
}

function createHttpClient(config) {
  return axios.create({
    timeout: config.timeoutMs,
    maxRedirects: 5,
    validateStatus: (s) => s < 400,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8"
    }
  });
}

function collectCookies(existing, next) {
  const combined = [...existing, ...next];
  const cookieSet = new Set(combined.map((c) => c.split(";")[0]));
  return Array.from(cookieSet).join("; ");
}

function parseScadaValue(textValue) {
  if (textValue === null || textValue === undefined) return null;
  let cleaned = String(textValue).trim();
  if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;
  if (cleaned.includes(".") && cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/,/g, ".");
  }
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

async function loginScada(config) {
  const client = createHttpClient(config);
  const loginPage = await client.get(config.loginUrl);
  const initialCookies = loginPage.headers["set-cookie"] || [];
  const initialHeader = collectCookies([], initialCookies);

  const $ = cheerio.load(loginPage.data);
  const viewState = $("input[name='__VIEWSTATE']").val();
  const eventValidation = $("input[name='__EVENTVALIDATION']").val();
  const viewStateGen = $("input[name='__VIEWSTATEGENERATOR']").val();

  if (!viewState) throw new Error("SCADA login failed: missing __VIEWSTATE");

  const loginData = new URLSearchParams({
    __VIEWSTATE: viewState, __VIEWSTATEGENERATOR: viewStateGen || "", __EVENTVALIDATION: eventValidation || "",
    txtUsername: config.username, txtPassword: config.password, btnLogin: "Login"
  });

  const loginResponse = await client.post(config.loginUrl, loginData.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: initialHeader, Referer: config.loginUrl }
  });

  const loginCookies = loginResponse.headers["set-cookie"] || [];
  const sessionCookie = collectCookies(initialCookies, loginCookies);

  return { client, sessionCookie };
}

async function warmUpViewCache(config, client, sessionCookie) {
  const url = `${config.baseUrl}/Scada/View.aspx?viewID=${config.viewId}`;
  try {
    await client.get(url, { headers: { Cookie: sessionCookie, Referer: `${config.baseUrl}/Scada/View.aspx` } });
  } catch (err) {
    console.warn("[SCADA][CLIENT] Warm-up failed:", err.message || err);
  }
}

function getFormattedTimestamp() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// ------------------------------------------------------------------
// CƠ CHẾ CHU KỲ FETCH ĐỌC VÀ ĐẨY DỮ LIỆU VÀO CACHE / LATEST API
// ------------------------------------------------------------------
async function fetchScadaData(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const source = config.source || "scada";

  const { client, sessionCookie } = await loginScada(config);
  await warmUpViewCache(config, client, sessionCookie);

  const url = buildCurCnlUrl(config);
  const response = await client.get(url, { headers: { Accept: "application/json", Cookie: sessionCookie, Referer: `${config.baseUrl}/Scada/View.aspx` } });

  const payload = response.data;
  const parsed = payload && payload.d ? JSON.parse(payload.d) : null;

  if (!parsed || !parsed.Success) {
    throw new Error(`SCADA response error: ${parsed?.ErrorMessage ?? "Unknown SCADA error"}`);
  }

  const currentTs = getFormattedTimestamp();

  (parsed.Data || []).forEach(async (item) => {
    const { station, parameter } = mapCnlToStationAndParameter(item.CnlNum);
    if (!station || !parameter) return;

    const rawId = String(station).toLowerCase();
    const stationId = buildStationId(source, rawId);
    const parsedValue = item.Text ? parseScadaValue(item.Text) : null;
    if (parsedValue === null) return;

    // 1. Đẩy thông tin vào RAM đệm lịch sử SCADA chờ hết chu kỳ 5 phút ghi 1 lần
    const cacheKey = `${stationId}|${parameter}`;
    scadaHistoryCache[cacheKey] = {
      logger_id: stationId,
      tag_key: parameter,
      data_ts: currentTs,
      value: parsedValue
    };

    // 2. CẬP NHẬT NGAY VÀO BẢNG LATEST PHỤC VỤ TRANG CHỦ / MAP
    try {
      await writer.saveLoggerPayload(db, {
        source, logger_id: stationId, raw_id: rawId, data_ts: currentTs, [parameter]: parsedValue
      });
      console.log(`[SCADA][${config.FETCH_INTERVAL_SECONDS}s] Cập nhật Latest -> ${stationId} (${parameter}: ${parsedValue})`);
    } catch (err) {
      console.error("[SCADA] Lỗi cập nhật logger_latest:", err.message);
    }
  });
}

// Kích hoạt chu kỳ FETCH lấy dữ liệu từ Server SCADA theo cấu hình .env
const fetchIntervalMs = DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS * 1000;
setInterval(async () => {
  console.log(`\n[SYSTEM][SCADA] Khởi động chu kỳ fetch dữ liệu sau mỗi ${DEFAULT_CONFIG.FETCH_INTERVAL_SECONDS}s...`);
  try {
    await fetchScadaData();
  } catch (error) {
    console.error("[SCADA POLL ERROR]:", error.message || error);
  }
}, fetchIntervalMs);

// ------------------------------------------------------------------
// CƠ CHẾ GHI ĐỒNG LOẠT DỮ LIỆU LỊCH SỬ SCADA (MỖI 5 PHÚT)
// ------------------------------------------------------------------
const saveIntervalMs = DEFAULT_CONFIG.SAVE_DB_INTERVAL_MINUTES * 60 * 1000;
setInterval(() => {
  const cachedItems = Object.values(scadaHistoryCache);
  if (cachedItems.length === 0) return;

  // Clear cache ngay lập tức để đón chu kỳ mới
  for (const key in scadaHistoryCache) { delete scadaHistoryCache[key]; }

  console.log(`\n--- [CƠ CHẾ SCADA ${DEFAULT_CONFIG.SAVE_DB_INTERVAL_MINUTES} PHÚT] Ghi ${cachedItems.length} dòng lịch sử vào SQLite ---`);

  db.serialize(() => {
    db.run("BEGIN IMMEDIATE TRANSACTION", (err) => {
      if (err) return;
      const stmt = db.prepare(`INSERT INTO logger_readings (logger_id, tag_key, data_ts, value) VALUES (?, ?, ?, ?)`);
      
      cachedItems.forEach((item) => {
        stmt.run([item.logger_id, item.tag_key, item.data_ts, item.value]);
      });

      stmt.finalize((e) => e ? db.run("ROLLBACK") : db.run("COMMIT", () => console.log("[DB][SCADA] Đã ghi nhận chuỗi lịch sử thành công.")));
    });
  });
}, saveIntervalMs);

module.exports = { fetchScadaData, parseScadaValue, cnlMapping, buildStationId };