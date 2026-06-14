"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const dbWriter = require("./backend/db/writer");
const sourcesApi = require("./backend/api/sources");

const mqttClientManager = require("./backend/Fetch/mqtt/client");
const scadaClientManager = require("./backend/Fetch/scada/client");
const tvaClientManager = require("./backend/Fetch/tva/client");
const monreClientManager = require("./backend/Fetch/monre/client");

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`[HỆ THỐNG] Khởi động thu thập dữ liệu tập trung. Đích đến: ${dbWriter.MYSQL_DB_PATH}`);

// ==========================================
// CẤU HÌNH FRONTEND
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FRONTEND_DIR = path.join(__dirname, "frontend");

app.use(express.static(FRONTEND_DIR));

app.use("/shared", express.static(path.join(FRONTEND_DIR, "shared")));
app.use("/assets", express.static(path.join(FRONTEND_DIR, "assets")));
app.use("/login", express.static(path.join(FRONTEND_DIR, "login")));
app.use("/pages", express.static(path.join(FRONTEND_DIR, "pages")));

// API tổng hợp flow, history, map-loggers...
app.use("/api/sources", sourcesApi);

// Trang chủ Dashboard KPI
app.get("/", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.get("/index.html", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Trang login
app.get("/login", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "login", "login.html"));
});

app.get("/login.html", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "login", "login.html"));
});

// Các trang phụ nếu tách thành file riêng
app.get("/page1", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "pages", "page1.html"));
});

app.get("/page2", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "pages", "page2.html"));
});

app.get("/page3", (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, "pages", "page3.html"));
});

// ==========================================
// API MAP LOGGER: /api/stations
// ==========================================
const LOGGER_COORDS_PATH = path.join(__dirname, "loggermap-helper", "modalsconfig.json");

function readLoggerCoordinates() {
    try {
        const raw = fs.readFileSync(LOGGER_COORDS_PATH, "utf8");
        const parsed = JSON.parse(raw);

        return parsed.coordinates || parsed || {};
    } catch (err) {
        console.error("[API][stations] Khong doc duoc file toa do:", err.message || err);
        return {};
    }
}

function formatStationName(stationKey) {
    const key = String(stationKey || "").toLowerCase();

    if (key.startsWith("tb")) return `Trạm bơm ${key.replace("tb", "").toUpperCase()}`;
    if (key.startsWith("qt")) return key.toUpperCase();
    if (key.startsWith("gs")) return key.toUpperCase();
    if (key.startsWith("g")) return `Logger ${key.toUpperCase()}`;

    return key.toUpperCase();
}

function getStationType(stationId) {
    const match = String(stationId || "").match(/^(mqtt|tva|scada)_/i);
    return match ? match[1].toLowerCase() : "logger";
}

function getUnit(parameter) {
    const key = String(parameter || "").toLowerCase();

    if (key === "flow") return "m3/h";
    if (key === "level") return "m";
    if (key === "ph") return "pH";
    if (key === "tds") return "mg/L";

    return "";
}

function buildStationsFromRows(rows, timeoutMinutes) {
    const coordinates = readLoggerCoordinates();
    const byStation = new Map();
    const now = Date.now();

    rows.forEach((row) => {
        const stationId = row.station_id;
        const stationKey = String(stationId || "").replace(/^(mqtt|tva|scada)_/i, "");
        const coord = coordinates[stationKey];

        if (!stationId || !coord) return;

        const lat = Number(coord.lat);
        const lng = Number(coord.lng ?? coord.lgn);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        if (!byStation.has(stationId)) {
            const updateTime = row.saved_ts || row.data_ts || null;
            const updateMs = updateTime ? new Date(updateTime).getTime() : NaN;
            const diffMinutes = Number.isFinite(updateMs) ? (now - updateMs) / 60000 : Infinity;

            byStation.set(stationId, {
                id: stationId,
                station_id: stationId,
                raw_id: stationKey,
                name: formatStationName(stationKey),
                type: getStationType(stationId),
                lat,
                lng,
                updateTime,
                lastUpdateInDB: row.saved_ts || null,
                timestamp: row.data_ts || null,
                hasValueChange: diffMinutes <= timeoutMinutes,
                data: []
            });
        }

        byStation.get(stationId).data.push({
            name: row.parameter,
            value: row.value,
            unit: getUnit(row.parameter)
        });
    });

    return Array.from(byStation.values()).sort((a, b) => {
        return a.name.localeCompare(b.name, "vi");
    });
}

app.get("/api/stations", (req, res) => {
    const timeoutMinutes = Math.max(1, Number(req.query.timeout) || 60);

    const sql = `
        WITH latest AS (
            SELECT station_id, parameter, MAX(id) AS latest_id
            FROM station_readings
            GROUP BY station_id, parameter
        )
        SELECT sr.station_id, sr.parameter, sr.value, sr.data_ts, sr.saved_ts
        FROM station_readings AS sr
        INNER JOIN latest
            ON latest.latest_id = sr.id
        ORDER BY sr.station_id, sr.parameter
    `;

    const db = new sqlite3.Database(dbWriter.MYSQL_DB_PATH);

    db.all(sql, (err, rows) => {
        db.close();

        if (err) {
            console.error("[API][stations] Loi doc database:", err.message || err);

            res.status(500).json({
                success: false,
                error: "Khong doc duoc du lieu tram"
            });
            return;
        }

        const stations = buildStationsFromRows(rows || [], timeoutMinutes);

        res.json({
            success: true,
            timeout: timeoutMinutes,
            total: stations.length,
            serverTimestamp: new Date().toISOString(),
            stations
        });
    });
});

// ==========================================
// LOGIC THU THẬP DỮ LIỆU
// ==========================================
let latestMqttNormalized = [];
let latestScadaNormalized = [];

const mqttClient = mqttClientManager.connect();

mqttClient.on("connect", () => {
    mqttClientManager.subscribe(mqttClient);

    mqttClientManager.onMessage(mqttClient, (mqttData) => {
        if (!mqttData || !Array.isArray(mqttData)) return;
        latestMqttNormalized.push(...mqttData);
    });
});

scadaClientManager.startPolling((scadaData) => {
    latestScadaNormalized = scadaData;
}, 30000);

const tvaJobs = tvaClientManager.scheduleTVAJobs({
    processNdjson: dbWriter.processNdjson,
    fetchIntervalMs: 30000,
    saveIntervalMinutes: 5
});

const monreJobs = monreClientManager.scheduleMonreJobs({
    processNdjson: dbWriter.processNdjson,
    fetchIntervalMs: 30000,
    saveIntervalMinutes: 5
});

let lastRunKey = null;

const dbSaveTick = () => {
    const now = new Date();
    const minute = now.getMinutes();

    if (minute % 5 !== 0) return;

    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${minute}`;
    if (key === lastRunKey) return;

    lastRunKey = key;

    const pad = (value) => String(value).padStart(2, "0");

    const saveTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(minute)}:00`;

    if (latestMqttNormalized.length > 0) {
        const mqttToSave = [...latestMqttNormalized];
        latestMqttNormalized = [];

        const mqttWithTs = mqttToSave.map((payload) => ({
            ...payload,
            ts: saveTs
        }));

        const mqttNdjson = mqttWithTs.map((payload) => JSON.stringify(payload)).join("\n");

        dbWriter.processNdjson(mqttNdjson)
            .then(({ inserted }) => {
                console.log(`[MQTT][SAVE] ${saveTs} đã lưu thành công ${inserted} dòng.`);
            })
            .catch((err) => {
                console.error("[MQTT][SAVE] Thất bại:", err.message || err);
            });
    }

    if (latestScadaNormalized.length > 0) {
        const scadaWithTs = latestScadaNormalized.map((payload) => ({
            ...payload,
            ts: saveTs
        }));

        const scadaNdjson = scadaWithTs.map((payload) => JSON.stringify(payload)).join("\n");

        dbWriter.processNdjson(scadaNdjson)
            .then(({ inserted }) => {
                console.log(`[SCADA][SAVE] ${saveTs} đã lưu thành công ${inserted} dòng.`);
            })
            .catch((err) => {
                console.error("[SCADA][SAVE] Thất bại:", err.message || err);
            });
    }
};

const globalSaveTimer = setInterval(dbSaveTick, 1000);

// ==========================================
// KHỞI CHẠY SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`\n[SERVER] 🚀 Giao diện web chạy tại: http://localhost:${PORT}`);
    console.log(`[SERVER] API stations: http://localhost:${PORT}/api/stations`);
    console.log(`[SERVER] API sources: http://localhost:${PORT}/api/sources/map-loggers`);
});

// ==========================================
// TẮT ỨNG DỤNG AN TOÀN
// ==========================================
process.on("SIGINT", () => {
    console.log("\n[HỆ THỐNG] Đang đóng an toàn các bộ hẹn giờ cào dữ liệu...");

    if (tvaJobs?.fetchTimer) clearInterval(tvaJobs.fetchTimer);
    if (tvaJobs?.saveTimer) clearInterval(tvaJobs.saveTimer);

    if (monreJobs?.fetchTimer) clearInterval(monreJobs.fetchTimer);
    if (monreJobs?.saveTimer) clearInterval(monreJobs.saveTimer);

    clearInterval(globalSaveTimer);

    if (mqttClient) mqttClient.end();

    process.exit(0);
});