"use strict";

const axios = require("axios");

const DEFAULT_MONRE_CONFIG = {
    username: process.env.MONRE_USERNAME || "capnuoccamau",
    password: process.env.MONRE_PASSWORD || "Qu@nTr@c2121",
    portalUrl: process.env.MONRE_PORTAL_URL || "https://iot.monre.gov.vn/portal/sharing/rest/generateToken",
    dataUrl: process.env.MONRE_DATA_URL || "https://iot.monre.gov.vn/server/rest/services/Hosted/TNN_BIGDATA_EVENT_NEW/FeatureServer/0/query",
    projectFilter: process.env.MONRE_PROJECT_FILTER || "(congtrinh='CAPNUOCCAMAU1' OR congtrinh='CONGTYCOPHANCAPNUOCC' OR congtrinh='NHAMAYCAPNUOCSO1' OR congtrinh='CAPNUOCCAMAUSO2')",
    timeoutMs: Number(process.env.MONRE_TIMEOUT_MS) || 30000
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

function normalizeKey(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
}

function formatTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function shouldPersistNow(date = new Date(), intervalMinutes = 5) {
    return date.getMinutes() % intervalMinutes === 0;
}

function parseEpoch(value) {
    if (typeof value === "number") return new Date(value);
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

function normalizeMonreFeatures(features) {
    const latestByStation = new Map();

    features.forEach((feature) => {
        const attr = feature.attributes || {};

        const stationName = normalizeKey(attr.tram || attr.station || "");
        const rawParameter = normalizeKey(attr.chiso || attr.parameter || "");
        const parameterName = MONRE_PARAMETER_MAP[rawParameter] || rawParameter;

        if (!stationName || !parameterName) return;

        const receiveTime = parseEpoch(attr.thoigiannhan);
        const measurementTime = parseEpoch(attr.thoigiando);
        const ts = formatTimestamp(receiveTime || measurementTime || new Date());

        const payload = latestByStation.get(stationName) || {
            station_id: `monre_${stationName}`,
            ts
        };

        payload[parameterName] = attr.giatri !== null && attr.giatri !== undefined ? Number(attr.giatri) : null;
        latestByStation.set(stationName, payload);
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

        const stationName = normalizeKey(attr.tram || attr.station || "");
        if (!stationName) return;

        groups[groupKey].add(`monre_${stationName}`);
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
    const normalized = normalizeMonreFeatures(features);

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
            const normalized = normalizeMonreFeatures(features);

            // FIX: Bổ sung in log chuẩn hóa từng dòng trạm giống như các client khác khi chạy tự động
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

        if (!cached || cached.length === 0) {
            return;
        }

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
    logStationsByLicense
};