"use strict";

const axios = require("axios");
const cheerio = require("cheerio");

const DEFAULT_CONFIG = {
  baseUrl: process.env.SCADA_URL || "http://14.161.36.253:86",
  loginUrl: process.env.SCADA_LOGIN_URL || "http://14.161.36.253:86/Scada/Login.aspx",
  username: process.env.SCADA_USERNAME || "cncamau",
  password: process.env.SCADA_PASSWORD || "cm123456",
  viewId: Number(process.env.SCADA_VIEW_ID) || 16,
  timeoutMs: Number(process.env.SCADA_TIMEOUT_MS) || 15000,
  source: "scada"
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

const cnlMapping = {
  2902: ["gs4nm2", "level"],
  2904: ["gs4nm2", "flow"],
  2905: ["gs4nm2", "totalIndex"],
  2907: ["gs5nm1", "level"],
  2909: ["gs5nm1", "flow"],
  2910: ["gs5nm1", "totalIndex"],
  2912: ["gs4nm1", "level"],
  2914: ["gs4nm1", "flow"],
  2915: ["gs4nm1", "totalIndex"],
  2917: ["tb1", "level"],
  2919: ["tb1", "flow"],
  2920: ["tb1", "totalIndex"],
  2922: ["tb24", "amino"],
  2923: ["tb24", "level"],
  2925: ["tb24", "nitrat"],
  2926: ["tb24", "pH"],
  2927: ["tb24", "TDS"],
  2928: ["gs5nm1", "amino"],
  2929: ["gs5nm1", "nitrat"],
  2930: ["gs5nm1", "pH"],
  2931: ["gs5nm1", "TDS"],
  2932: ["gs4nm2", "amino"],
  2933: ["gs4nm2", "nitrat"],
  2934: ["gs4nm2", "pH"],
  2935: ["gs4nm2", "TDS"]
};

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
  const params = new URLSearchParams({
    cnlNums: " ",
    viewIDs: " ",
    viewID: String(config.viewId),
    _: String(Date.now())
  });

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

  if (!viewState) {
    throw new Error("SCADA login failed: missing __VIEWSTATE");
  }

  const loginData = new URLSearchParams({
    __VIEWSTATE: viewState,
    __VIEWSTATEGENERATOR: viewStateGen || "",
    __EVENTVALIDATION: eventValidation || "",
    txtUsername: config.username,
    txtPassword: config.password,
    btnLogin: "Login"
  });

  const loginResponse = await client.post(config.loginUrl, loginData.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: initialHeader,
      Referer: config.loginUrl
    }
  });

  const loginCookies = loginResponse.headers["set-cookie"] || [];
  const sessionCookie = collectCookies(initialCookies, loginCookies);

  return { client, sessionCookie };
}

async function warmUpViewCache(config, client, sessionCookie) {
  const url = `${config.baseUrl}/Scada/View.aspx?viewID=${config.viewId}`;

  try {
    await client.get(url, {
      headers: {
        Cookie: sessionCookie,
        Referer: `${config.baseUrl}/Scada/View.aspx`
      }
    });
  } catch (err) {
    console.warn("[SCADA][CLIENT] Warm-up failed:", err.message || err);
  }
}

function getFormattedTimestamp() {
  const now = new Date();
  const pad = (v) => String(v).padStart(2, "0");

  const date = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join("-");

  const time = [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join(":");

  return `${date} ${time}`;
}

async function fetchScadaData(overrides = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const source = config.source || "scada";

  const { client, sessionCookie } = await loginScada(config);
  await warmUpViewCache(config, client, sessionCookie);

  const url = buildCurCnlUrl(config);
  const response = await client.get(url, {
    headers: {
      Accept: "application/json",
      Cookie: sessionCookie,
      Referer: `${config.baseUrl}/Scada/View.aspx`
    }
  });

  const payload = response.data;
  const parsed = payload && payload.d ? JSON.parse(payload.d) : null;

  if (!parsed || !parsed.Success) {
    const message = parsed?.ErrorMessage ?? "Unknown SCADA error";
    throw new Error(`SCADA response error: ${message}`);
  }

  const currentTs = getFormattedTimestamp();
  const stationsMap = new Map();

  (parsed.Data || []).forEach((item) => {
    const { station, parameter } = mapCnlToStationAndParameter(item.CnlNum);
    if (!station || !parameter) return;

    const rawId = String(station).toLowerCase();
    const stationId = buildStationId(source, rawId);
    const coord = RAW_LOGGER_STATIONS[rawId] || {};

    if (!stationsMap.has(stationId)) {
      stationsMap.set(stationId, {
        source,
        station_id: stationId,
        raw_id: rawId,
        name: rawId.toUpperCase(),
        scada_id: rawId,
        ts: currentTs,
        data_ts: currentTs,
        lat: coord.lat ?? null,
        lng: coord.lng ?? null
      });
    }

    const stationData = stationsMap.get(stationId);
    stationData[parameter] = item.Text ? parseScadaValue(item.Text) : null;
  });

  const normalizedData = Array.from(stationsMap.values());

  normalizedData.forEach((stationObj) => {
    console.log(`[SCADA][DATA] ${JSON.stringify(stationObj)}`);
  });

  return normalizedData;
}

function startPolling(callback, intervalMs = 60000, options = {}) {
  const execute = async () => {
    try {
      console.log("[SCADA][FETCH] Starting");
      const data = await fetchScadaData(options);
      console.log(`[SCADA][FETCH] Got ${Array.isArray(data) ? data.length : 0} stations`);

      if (Array.isArray(data) && data.length > 0 && typeof callback === "function") {
        callback(data);
      }
    } catch (error) {
      console.error("[SCADA ERROR]:", error.message || error);
    }
  };

  execute();
  return setInterval(execute, intervalMs);
}

module.exports = {
  startPolling,
  fetchScadaData,
  parseScadaValue,
  cnlMapping,
  RAW_LOGGER_STATIONS,
  buildStationId
};
