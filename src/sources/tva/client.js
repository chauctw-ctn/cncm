"use strict";

const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_TVA_CONFIG = {
  baseUrl: process.env.TVA_URL || "http://camau.dulieuquantrac.com:8906",
  loginUrl: process.env.TVA_LOGIN_URL || "http://camau.dulieuquantrac.com:8906/index.php?module=users&view=users&task=checklogin",
  username: process.env.TVA_USERNAME || "ctncamau@quantrac.net",
  password: process.env.TVA_PASSWORD || "123456789",
  loginPath: process.env.TVA_LOGIN_PATH || "/dang-nhap/",
  timeoutMs: Number(process.env.TVA_TIMEOUT_MS) || 15000,
  maxRetries: Number(process.env.TVA_MAX_RETRIES) || 3,
  retryDelayMs: Number(process.env.TVA_RETRY_DELAY_MS) || 5000,
  source: "tva"
};

const RAW_LOGGER_STATIONS = {
  g15: { lat: 9.1835, lng: 105.152611 },
  g18: { lat: 9.175669, lng: 105.170509 },
  g29a: { lat: 9.14649, lng: 105.139282 },
  g30a: { lat: 9.165363, lng: 105.157047 },
  g31b: { lat: 9.206425, lng: 105.166463 },
  gs1nm1: { lat: 9.205068, lng: 105.133103 },
  gs1nm2: { lat: 9.205104, lng: 105.131994 },
  gs2nm1: { lat: 9.173416, lng: 105.209793 },
  gs2nm2: { lat: 9.173416, lng: 105.209793 },
  gs3nm1: { lat: 9.205121, lng: 105.132026 },
  gs3nm2: { lat: 9.173283, lng: 105.209918 },
  gs4nm1: { lat: 9.170691, lng: 105.214664 },
  gs4nm2: { lat: 9.204509, lng: 105.128481 },
  gs5nm1: { lat: 9.168239, lng: 105.212727 },
  gtacvan: { lat: 9.163367, lng: 105.251512 },
  qt1nm1: { lat: 9.173508, lng: 105.209793 },
  qt1nm2: { lat: 9.205658, lng: 105.12963 },
  qt2: { lat: 9.179219, lng: 105.139376 },
  qt2nm1: { lat: 9.205197, lng: 105.133057 },
  qt2nm2: { lat: 9.203337, lng: 105.129712 },
  qt3: { lat: 9.178764, lng: 105.162811 },
  qt4: { lat: 9.1815, lng: 105.1488 },
  qt5: { lat: 9.178642, lng: 105.154274 },
  tb1: { lat: 9.177, lng: 105.152 },
  tb2: { lat: 9.241708, lng: 105.134453 },
  tb4: { lat: 9.231647, lng: 105.157951 },
  tb12: { lat: 9.196925, lng: 105.160156 },
  tb16: { lat: 9.181186, lng: 105.088219 },
  tb20: { lat: 9.152653, lng: 105.157631 },
  tb21: { lat: 9.141861, lng: 105.138564 },
  tb22: { lat: 9.130936, lng: 105.135063 },
  tb23: { lat: 9.119739, lng: 105.141647 },
  tb24: { lat: 9.108739, lng: 105.136789 },
  tb25: { lat: 9.100839, lng: 105.133297 },
  tb26: { lat: 9.092956, lng: 105.133219 },
  tb27: { lat: 9.081444, lng: 105.132731 }
};

const TVA_PARAMETER_MAP = {
  mucnuoc: "level",
  luuluong: "flow",
  tongluuluong: "totalIndex"
};

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

    if (name && value) {
      cookieMap[name.trim()] = value.trim();
    }
  });

  return Object.entries(cookieMap)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
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

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseUpdateTime(value) {
  if (!value) return null;

  const cleaned = String(value).trim();
  const match = cleaned.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return null;

  const [, day, month, year, hours = "0", minutes = "0", seconds = "0"] = match;
  const pad = (v) => String(v).padStart(2, "0");

  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function normalizeStationId(name) {
  const normalized = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const compactKey = normalized.replace(/[^a-z0-9]+/g, "");

  const explicitOverrides = {
    qt3182gpbtnmt: "qt3",
    qt1nm12186gpbtnmt: "qt1nm1",
    qt2nm12186gpbtnmt: "qt2nm1"
  };

  if (explicitOverrides[compactKey]) {
    return explicitOverrides[compactKey];
  }

  const compact = normalized
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

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

function normalizeStations(stations, options = {}) {
  const config = { ...DEFAULT_TVA_CONFIG, ...options };
  const source = config.source || "tva";

  return stations.map((station) => {
    const rawId = normalizeStationId(station.stationName);
    const stationId = buildStationId(source, rawId);
    const ts = parseUpdateTime(station.updateTime) || formatTimestamp(station.fetchedAt || new Date());
    const coord = RAW_LOGGER_STATIONS[rawId] || {};

    const payload = {
      source,
      station_id: stationId,
      raw_id: rawId,
      name: String(station.stationName || rawId).trim() || rawId.toUpperCase(),
      tva_id: rawId,
      ts,
      data_ts: ts,
      lat: coord.lat ?? null,
      lng: coord.lng ?? null
    };

    station.measurements.forEach((measurement) => {
      const key = normalizeParameterName(measurement.name);
      if (!key) return;

      payload[key] = normalizeNumber(measurement.value);
    });

    return payload;
  });
}

function normalizeToNdjson(payloads) {
  return payloads.map((payload) => JSON.stringify(payload)).join("\n");
}

async function loginTVA(config) {
  const client = createHttpClient(config);
  const loginPageRes = await client.get(config.baseUrl);
  let cookies = loginPageRes.headers["set-cookie"] || [];

  const $login = cheerio.load(loginPageRes.data);
  const formToken = $login("input[name='is_dtool_form']").val();

  const loginData = new URLSearchParams({
    "fields[email]": config.username,
    "fields[password]": config.password,
    remember_account: "on",
    is_dtool_form: formToken || ""
  });

  const loginRes = await client.post(
    `${config.baseUrl}${config.loginPath}`,
    loginData.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: buildCookieHeader(cookies),
        Referer: config.baseUrl
      }
    }
  );

  if (loginRes.headers["set-cookie"]) {
    cookies = [...cookies, ...loginRes.headers["set-cookie"]];
  }

  return { client, cookieHeader: buildCookieHeader(cookies) };
}

async function fetchTVAData(overrides = {}) {
  const config = { ...DEFAULT_TVA_CONFIG, ...overrides };
  const { client, cookieHeader } = await loginTVA(config);

  const res = await client.get(config.baseUrl, {
    headers: {
      Cookie: cookieHeader,
      Referer: config.baseUrl
    }
  });

  const html = res.data;
  const $ = cheerio.load(html);
  const stations = [];
  const fetchedAt = new Date();

  $(".segmentData").each((index, segment) => {
    const $segment = $(segment);
    const stationName = $segment.find(".headerChart").first().text().trim();

    const updateTime = $segment
      .find(".headerNow")
      .first()
      .text()
      .replace(/Thoi\s*diem:|Thời\s*điểm:/gi, "")
      .trim();

    const measurements = [];

    $segment.find(".left .table .row").each((_, row) => {
      const $row = $(row);
      if ($row.hasClass("header")) return;

      const cols = $row.find(".col");
      if (cols.length < 4) return;

      const name = $(cols[1]).text().trim();
      const time = $(cols[2]).text().trim();
      const value = $(cols[3]).text().trim();
      const unit = $(cols[4]).text().trim();

      if (name && value) {
        measurements.push({ name, time, value, unit });
      }
    });

    if (stationName && measurements.length > 0) {
      stations.push({
        stationName,
        updateTime,
        measurements,
        fetchedAt
      });
    }
  });

  return { stations, fetchedAt };
}

async function debugFetchTVA(overrides = {}) {
  const result = await fetchTVAData(overrides);
  const normalized = normalizeStations(result.stations, overrides);

  normalized.forEach((payload) => {
    console.log(`[TVA][DATA] ${JSON.stringify(payload)}`);
  });

  return { ...result, normalized };
}

function scheduleFetchEveryThirtySeconds(overrides = {}) {
  let inFlight = false;
  const onFetch = overrides.onFetch;
  const fetchIntervalMs = Number(overrides.fetchIntervalMs) || 30000;

  const runFetch = async () => {
    if (inFlight) return;

    inFlight = true;

    try {
      console.log("[TVA][FETCH] Starting");
      const result = await fetchTVAData(overrides);
      const normalized = normalizeStations(result.stations, overrides);
      console.log(`[TVA][FETCH] Got ${normalized.length} stations`);

      normalized.forEach((payload) => {
        console.log(`[TVA][DATA] ${JSON.stringify(payload)}`);
      });

      if (typeof onFetch === "function") {
        onFetch(normalized);
      }
    } catch (err) {
      console.error("[TVA][FETCH] Failed", err.message || err);
    } finally {
      inFlight = false;
    }
  };

  runFetch();
  return setInterval(runFetch, fetchIntervalMs);
}

function scheduleEveryFiveMinutes(overrides = {}) {
  let lastRunKey = null;

  const getLatestNormalized = overrides.getLatestNormalized;
  const saveIntervalMinutes = Number(overrides.saveIntervalMinutes) || 5;
  const tickIntervalMs = Number(overrides.tickIntervalMs) || 1000;
  const processNdjsonFn = overrides.processNdjson;

  const tick = () => {
    const now = new Date();
    const minute = now.getMinutes();

    if (minute % saveIntervalMinutes !== 0) return;

    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minute}`;
    if (key === lastRunKey) return;

    lastRunKey = key;

    if (typeof getLatestNormalized !== "function") return;

    const cached = getLatestNormalized();
    const saveTs = formatTimestamp(now);

    if (!cached || cached.length === 0) {
      console.log(`[TVA][SAVE] ${saveTs} skipped: no cached data`);
      return;
    }

    const ndjson = normalizeToNdjson(cached);

    if (typeof processNdjsonFn === "function") {
      processNdjsonFn(ndjson, overrides.db ? { dbPath: overrides.db } : {})
        .then(({ inserted }) => {
          console.log(`[TVA][SAVE] ${saveTs} inserted ${inserted} rows`);
        })
        .catch((err) => {
          console.error("[TVA][SAVE] Failed", err.message || err);
        });
    }
  };

  tick();
  return setInterval(tick, tickIntervalMs);
}

function scheduleTVAJobs(overrides = {}) {
  let latestNormalized = [];

  const fetchTimer = scheduleFetchEveryThirtySeconds({
    ...overrides,
    onFetch: (normalized) => {
      latestNormalized = normalized;
    }
  });

  const saveTimer = scheduleEveryFiveMinutes({
    ...overrides,
    getLatestNormalized: () => latestNormalized
  });

  return { fetchTimer, saveTimer };
}

async function getTVADataWithRetry(overrides = {}) {
  const config = { ...DEFAULT_TVA_CONFIG, ...overrides };
  let lastError = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await debugFetchTVA(config);
    } catch (error) {
      lastError = error;

      console.error(`[TVA] Attempt ${attempt} failed:`, error.message || error);

      if (attempt < config.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs));
      }
    }
  }

  throw new Error(`TVA fetch failed after ${config.maxRetries} attempts: ${lastError}`);
}

module.exports = {
  fetchTVAData,
  debugFetchTVA,
  getTVADataWithRetry,
  formatTimestamp,
  normalizeStations,
  scheduleFetchEveryThirtySeconds,
  scheduleEveryFiveMinutes,
  scheduleTVAJobs,
  scheduleTvaJobs: scheduleTVAJobs,
  RAW_LOGGER_STATIONS,
  TVA_PARAMETER_MAP,
  buildStationId
};
