"use strict";

const express = require("express");
const path = require("path");
const dbWriter = require("./backend/db/writer");
const sourcesApi = require("./backend/api/sources");

const mqttClientManager  = require("./backend/Fetch/mqtt/client");
const scadaClientManager = require("./backend/Fetch/scada/client"); 
const tvaClientManager   = require("./backend/Fetch/tva/client");
const monreClientManager = require("./backend/Fetch/monre/client");

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`[HỆ THỐNG] Khởi động thu thập dữ liệu tập trung. Đích đến: ${dbWriter.MYSQL_DB_PATH}`);

// ==========================================
// CẤU HÌNH PHỤC VỤ FRONTEND
// ==========================================
// Cấu hình static files: Cho phép truy cập css, js, hình ảnh từ thư mục frontend
app.use(express.static(path.join(__dirname, "frontend")));
app.use("/api/sources", sourcesApi);
app.use("/shared", express.static(path.join(__dirname, "frontend/shared"))); // Nếu layout nằm riêng

// Endpoint trả về trang giao diện chính
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Bạn có thể viết thêm API lấy dữ liệu tại đây cho Frontend fetch về, ví dụ:
// app.get("/api/dashboard", async (req, res) => { ... });


// ==========================================
// LOGIC THU THẬP DỮ LIỆU CŨ CỦA BẠN (GIỮ NGUYÊN)
// ==========================================
let latestMqttNormalized  = [];
let latestScadaNormalized = [];

const mqttClient = mqttClientManager.connect();
mqttClient.on("connect", () => {
    mqttClientManager.subscribe(mqttClient);    
    mqttClientManager.onMessage(mqttClient, (mqttData, topic) => {
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

    const pad = (v) => String(v).padStart(2, "0");
    const saveTs = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(minute)}:00`;

    if (latestMqttNormalized && latestMqttNormalized.length > 0) {
        const mqttToSave = [...latestMqttNormalized];
        latestMqttNormalized = []; 
        const mqttWithTs = mqttToSave.map(payload => ({ ...payload, ts: saveTs }));
        const mqttNdjson = mqttWithTs.map(p => JSON.stringify(p)).join("\n");
        
        dbWriter.processNdjson(mqttNdjson)
            .then(({ inserted }) => console.log(`[MQTT][SAVE] ${saveTs} đã lưu thành công ${inserted} dòng.`))
            .catch(err => console.error("[MQTT][SAVE] Thất bại:", err.message || err));
    }

    if (latestScadaNormalized && latestScadaNormalized.length > 0) {
        const scadaWithTs = latestScadaNormalized.map(payload => ({ ...payload, ts: saveTs }));
        const scadaNdjson = scadaWithTs.map(p => JSON.stringify(p)).join("\n");
        
        dbWriter.processNdjson(scadaNdjson)
            .then(({ inserted }) => console.log(`[SCADA][SAVE] ${saveTs} đã lưu thành công ${inserted} dòng.`))
            .catch(err => console.error("[SCADA][SAVE] Thất bại:", err.message || err));
    }
};

const globalSaveTimer = setInterval(dbSaveTick, 1000);

// Khởi chạy Web Server
app.listen(PORT, () => {
    console.log(`\n[SERVER] 🚀 Giao diện web chạy tại: http://localhost:${PORT}`);
});

// ==========================================
// QUẢN LÝ TẮT ỨNG DỤNG AN TOÀN
// ==========================================
process.on("SIGINT", () => {
    console.log("\n[HỆ THỐNG] Đang đóng an toàn các bộ hẹn giờ cào dữ liệu...");
    clearInterval(tvaJobs.fetchTimer);
    clearInterval(tvaJobs.saveTimer);
    clearInterval(monreJobs.fetchTimer); 
    clearInterval(monreJobs.saveTimer);  
    clearInterval(globalSaveTimer);
    if (mqttClient) mqttClient.end();
    process.exit(0);
});
