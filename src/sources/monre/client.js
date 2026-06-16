"use strict";

const axios = require("axios");

const DEFAULT_MONRE_CONFIG = {
  username: process.env.MONRE_USERNAME || "capnuoccamau",
  password: process.env.MONRE_PASSWORD || "Qu@nTr@c2121",
  portalUrl: process.env.MONRE_PORTAL_URL || "https://iot.monre.gov.vn/portal/sharing/rest/generateToken",
  dataUrl: process.env.MONRE_DATA_URL || "https://iot.monre.gov.vn/server/rest/services/Hosted/TNN_BIGDATA_EVENT_NEW/FeatureServer/0/query",
  projectFilter:
    process.env.MONRE_PROJECT_FILTER ||
    "(congtrinh='CAPNUOCCAMAU1' OR congtrinh='CONGTYCOPHANCAPNUOCC' OR congtrinh='NHAMAYCAPNUOCSO1' OR congtrinh='CAPNUOCCAMAUSO2')",
  timeoutMs: Number(process.env.MONRE_TIMEOUT_MS) || 30000,
  source: "monre"
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

const MONRE_PARAMETER_MAP = {
  mucnuoc: "level",
  luuluong: "flow",
  tongluuluong: "totalIndex"
};

const MONRE_LICENSE_MAP = {
  NHAMAYCAPNUOCSO1: "STATION_GP393",
  CONGTYCOPHANCAPNUOCC: "STATION_GP391",
  CAPNUOCCAMAU1: "STATION_GP35",
  CAPNUOCCAMAUSO2: "STATION_GP36"
};

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

  const explicitOverrides = {
    qt3182gpbtnmt: "qt3",
    qt1nm12186gpbtnmt: "qt1nm1",
    qt2nm12186gpbtnmt: "qt2nm1"
  };

  return explicitOverrides[key] || key;
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function shouldPersistNow(date = new Date(), intervalMinutes = 5) {
  return date.getMinutes() % intervalMinutes === 0;
}

function parseEpoch(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") {
    return new Date(value);
  }

  const asNumber = Number(value);

  if (!Number.isNaN(asNumber)) {
    return new Date(asNumber);
  }

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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 10000
  });

  if (response.data && response.data.token) {
    cachedToken = response.data.token;
    tokenExpiry = Date.now() + 60 * 60 * 1000;
    return cachedToken;
  }

  throw new Error("Invalid MONRE token response");
}

async function fetchMonreData(overrides = {}) {
  const config = { ...DEFAULT_MONRE_CONFIG, ...overrides };
  const token = await getToken(config);

  const params = {
    f: "json",
    where: config.projectFilter,
    outFields: "*",
    orderByFields: "thoigiannhan DESC",
    resultRecordCount: 1500000,
    token
  };

  const response = await axios.get(config.dataUrl, {
    params,
    timeout: config.timeoutMs
  });

  return response.data.features || [];
}

function normalizeMonreFeatures(features, options = {}) {
  const config = { ...DEFAULT_MONRE_CONFIG, ...options };
  const source = config.source || "monre";
  const latestByStation = new Map();

  features.forEach((feature) => {
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
    const coord = RAW_LOGGER_STATIONS[rawId] || {};

    const payload = latestByStation.get(stationId) || {
      source,
      station_id: stationId,
      raw_id: rawId,
      name: String(rawStationName || rawId).trim() || rawId.toUpperCase(),
      monre_id: rawId,
      ts,
      data_ts: ts,
      lat: coord.lat ?? null,
      lng: coord.lng ?? null
    };

    const value =
      attr.giatri !== null && attr.giatri !== undefined && !Number.isNaN(Number(attr.giatri))
        ? Number(attr.giatri)
        : null;

    payload[parameterName] = value;
    latestByStation.set(stationId, payload);
  });

  return Array.from(latestByStation.values());
}

function logStationsByLicense(features) {
  const groups = {
    STATION_GP393: new Set(),
    STATION_GP391: new Set(),
    STATION_GP35: new Set(),
    STATION_GP36: new Set()
  };

  features.forEach((feature) => {
    const attr = feature.attributes || {};
    const congtrinh = String(attr.congtrinh || "").trim().toUpperCase();
    const groupKey = MONRE_LICENSE_MAP[congtrinh];

    if (!groupKey) return;

    const rawId = normalizeStationRawId(attr.tram || attr.station || "");
    if (!rawId) return;

    groups[groupKey].add(`monre_${rawId}`);
  });

  Object.entries(groups).forEach(([groupKey, stations]) => {
    const stationList = Array.from(stations).sort();

    console.log(`[${groupKey}]: ${stationList.length}`);

    stationList.forEach((stationId, index) => {
      console.log(`${index + 1}. ${stationId}`);
    });

    console.log("");
  });
}

function normalizeToNdjson(payloads) {
  return payloads.map((payload) => JSON.stringify(payload)).join("\n");
}

async function debugFetchMonre(overrides = {}) {
  const features = await fetchMonreData(overrides);

  logStationsByLicense(features);

  const normalized = normalizeMonreFeatures(features, overrides);

  console.log(`[MONRE][DEBUG] Total stations ${normalized.length}`);

  normalized.forEach((payload) => {
    console.log(`[MONRE][DATA] ${JSON.stringify(payload)}`);
  });

  return normalized;
}

function scheduleFetchEveryThirtySeconds(overrides = {}) {
  let inFlight = false;
  const onFetch = overrides.onFetch;
  const fetchIntervalMs = Number(overrides.fetchIntervalMs) || 30000;

  const runFetch = async () => {
    if (inFlight) return;

    inFlight = true;

    try {
      const features = await fetchMonreData(overrides);
      const normalized = normalizeMonreFeatures(features, overrides);

      normalized.forEach((payload) => {
        console.log(`[MONRE][DATA] ${JSON.stringify(payload)}`);
      });

      if (typeof onFetch === "function") {
        onFetch(normalized);
      }
    } catch (err) {
      console.error("[MONRE][FETCH] Failed", err.message || err);
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

    if (!shouldPersistNow(now, saveIntervalMinutes)) return;

    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

    if (key === lastRunKey) return;

    lastRunKey = key;

    if (typeof getLatestNormalized !== "function") return;

    const cached = getLatestNormalized();
    const saveTs = formatTimestamp(now);

    if (!cached || cached.length === 0) return;

    const ndjson = normalizeToNdjson(cached);

    if (typeof processNdjsonFn === "function") {
      processNdjsonFn(ndjson, overrides.db ? { dbPath: overrides.db } : {})
        .then(({ inserted }) => {
          console.log(`[MONRE][SAVE] ${saveTs} inserted ${inserted} rows`);
        })
        .catch((err) => {
          console.error("[MONRE][SAVE] Failed", err.message || err);
        });
    }
  };

  tick();
  return setInterval(tick, tickIntervalMs);
}

function scheduleMonreJobs(overrides = {}) {
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

module.exports = {
  fetchMonreData,
  debugFetchMonre,
  normalizeMonreFeatures,
  formatTimestamp,
  scheduleFetchEveryThirtySeconds,
  scheduleEveryFiveMinutes,
  scheduleMonreJobs,
  logStationsByLicense,
  RAW_LOGGER_STATIONS,
  MONRE_PARAMETER_MAP,
  MONRE_LICENSE_MAP,
  buildStationId
};