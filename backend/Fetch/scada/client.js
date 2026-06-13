"use strict";

const axios   = require("axios");
const cheerio = require("cheerio");

const DEFAULT_CONFIG = {
    baseUrl:   process.env.SCADA_URL         || "http://14.161.36.253:86",
    loginUrl:  process.env.SCADA_LOGIN_URL    || "http://14.161.36.253:86/Scada/Login.aspx",
    username:  process.env.SCADA_USERNAME     || "cncamau",
    password:  process.env.SCADA_PASSWORD     || "cm123456",
    viewId:    Number(process.env.SCADA_VIEW_ID)    || 16,
    timeoutMs: Number(process.env.SCADA_TIMEOUT_MS) || 15000
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

// ── Private Helpers ──────────────────────────────────────────────────────────

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
        viewID:  String(config.viewId),
        _:       String(Date.now())
    });
    return `${config.baseUrl}/Scada/ClientApiSvc.svc/GetCurCnlDataExt?${params}`;
}

function createHttpClient(config) {
    return axios.create({
        timeout:        config.timeoutMs,
        maxRedirects:   5,
        validateStatus: (s) => s < 400,
        headers: {
            "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept:            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8"
        }
    });
}

function collectCookies(existing, next) {
    const combined  = [...existing, ...next];
    const cookieSet = new Set(combined.map((c) => c.split(";")[0]));
    return Array.from(cookieSet).join("; ");
}

/**
 * Chuẩn hóa chuỗi số từ SCADA (Ví dụ: "1.234,56" hoặc "999,838") về định dạng Number thực tế
 */
function parseScadaValue(textValue) {
    if (textValue === null || textValue === undefined) return null;
    
    let cleaned = String(textValue).trim();
    if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "nan") return null;

    // Nếu chuỗi chứa cả dấu chấm (ngàn) và dấu phẩy (thập phân) dạng hiển thị vi-VN: 1.234,56
    if (cleaned.includes(".") && cleaned.includes(",")) {
        cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
    } 
    // Nếu chỉ có dấu phẩy đơn lẻ đóng vai trò ngăn thập phân: 999,838 -> 999.838
    else if (cleaned.includes(",")) {
        cleaned = cleaned.replace(/,/g, ".");
    }

    const num = Number(cleaned);
    return Number.isNaN(num) ? null : num;
}

async function loginScada(config) {
    const client = createHttpClient(config);

    const loginPage      = await client.get(config.loginUrl);
    const initialCookies = loginPage.headers["set-cookie"] || [];
    const initialHeader  = collectCookies([], initialCookies);

    const $              = cheerio.load(loginPage.data);
    const viewState        = $("input[name='__VIEWSTATE']").val();
    const eventValidation  = $("input[name='__EVENTVALIDATION']").val();
    const viewStateGen     = $("input[name='__VIEWSTATEGENERATOR']").val();

    if (!viewState) throw new Error("SCADA login failed: missing __VIEWSTATE");

    const loginData = new URLSearchParams({
        __VIEWSTATE:          viewState,
        __VIEWSTATEGENERATOR: viewStateGen    || "",
        __EVENTVALIDATION:    eventValidation || "",
        txtUsername:          config.username,
        txtPassword:          config.password,
        btnLogin:             "Login"
    });

    const loginResponse = await client.post(config.loginUrl, loginData.toString(), {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie:          initialHeader,
            Referer:         config.loginUrl
        }
    });

    const loginCookies  = loginResponse.headers["set-cookie"] || [];
    const sessionCookie = collectCookies(initialCookies, loginCookies);
    return { client, sessionCookie };
}

async function warmUpViewCache(config, client, sessionCookie) {
    const url = `${config.baseUrl}/Scada/View.aspx?viewID=${config.viewId}`;
    try {
        await client.get(url, {
            headers: { Cookie: sessionCookie, Referer: `${config.baseUrl}/Scada/View.aspx` }
        });
    } catch (err) {
        console.warn("[SCADA][CLIENT] Warm-up failed:", err.message || err);
    }
}

function getFormattedTimestamp() {
    const now = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    return [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate())
    ].join("-") + " " + [
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds())
    ].join(":");
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Fetch dữ liệu hiện tại từ Rapid SCADA và chuẩn hóa gộp trạm
 * @param {Partial<typeof DEFAULT_CONFIG>} [overrides]
 */
async function fetchScadaData(overrides = {}) {
    const config = { ...DEFAULT_CONFIG, ...overrides };
    const { client, sessionCookie } = await loginScada(config);
    await warmUpViewCache(config, client, sessionCookie);

    const url      = buildCurCnlUrl(config);
    const response = await client.get(url, {
        headers: {
            Accept:  "application/json",
            Cookie:  sessionCookie,
            Referer: `${config.baseUrl}/Scada/View.aspx`
        }
    });

    const payload = response.data;
    const parsed  = payload && payload.d ? JSON.parse(payload.d) : null;

    if (!parsed || !parsed.Success) {
        const message = parsed?.ErrorMessage ?? "Unknown SCADA error";
        throw new Error(`SCADA response error: ${message}`);
    }

    const currentTs = getFormattedTimestamp();
    const stationsMap = new Map();

    (parsed.Data || []).forEach((item) => {
        const { station, parameter } = mapCnlToStationAndParameter(item.CnlNum);
        if (!station || !parameter) return;

        if (!stationsMap.has(station)) {
            stationsMap.set(station, {
                scada_id: station,
                ts: currentTs // Khóa đồng bộ trung gian nhận diện mốc thời gian cào dữ liệu gốc
            });
        }

        const stationData = stationsMap.get(station);
        
        // FIX: Đã bọc hàm ép kiểu số Number thực tế thay vì giữ chuỗi text thô chứa dấu phẩy
        stationData[parameter] = item.Text ? parseScadaValue(item.Text) : null;
    });

    const normalizedData = Array.from(stationsMap.values());

    normalizedData.forEach((stationObj) => {
        console.log(`[SCADA][DATA] ${JSON.stringify(stationObj)}`);
    });

    return normalizedData;
}

/**
 * Kích hoạt Polling nhận tin nhắn tuần tự (giống cách gọi MQTT)
 * @param {Function} callback 
 * @param {number} intervalMs 
 * @param {object} options 
 */
function startPolling(callback, intervalMs = 60000, options = {}) {
    const execute = async () => {
        try {
            const data = await fetchScadaData(options);
            if (data && data.length > 0) {
                callback(data);
            }
        } catch (error) {
            console.error("[SCADA ERROR]:", error.message || error);
        }
    };

    execute();
    return setInterval(execute, intervalMs);
}

module.exports = { startPolling, fetchScadaData };