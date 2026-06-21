"use strict";
const express = require("express");
const loggerController = require("./loggerController");
const adminController = require("./adminController"); // Thêm controller quản trị mới
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE"); 
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ===================================================================
// I. HỆ THỐNG API GIAO DIỆN CHÍNH (MAP / CHART)
// ===================================================================
app.get("/api/logger/latest", loggerController.getLatest);
app.get("/api/logger/history", loggerController.getHistory);


// ===================================================================
// II. HỆ THỐNG API QUẢN TRỊ CẤU HÌNH (STATIONS / TAG MAPPINGS)
// ===================================================================
// 1. Quản lý trạm hiển thị
app.get("/api/config/stations", loggerController.getAllStations);
app.post("/api/config/stations", loggerController.createStation);
app.put("/api/config/stations/:station_id", loggerController.updateStation);
app.delete("/api/config/stations/:station_id", loggerController.deleteStation);

// 2. Quản lý Mapping gán Tag vào trạm
app.post("/api/config/tags", loggerController.addTagMapping);
app.delete("/api/config/tags/:id", loggerController.deleteTagMapping);


// ===================================================================
// III. HỆ THỐNG API QUẢN TRỊ MỞ RỘNG (USERS / ALERTS / TELEGRAM)
// ===================================================================
// 1. Quản lý Thành viên (User Management)
app.get("/api/users", adminController.getUsers);
app.post("/api/users", adminController.createUser);
app.delete("/api/users/:id", adminController.deleteUser);

// 2. Quản lý cài đặt Ngưỡng Cảnh báo (Alert rules)
app.get("/api/alerts/thresholds", adminController.getThresholds);
app.post("/api/alerts/thresholds", adminController.upsertThreshold);
app.delete("/api/alerts/thresholds/:id", adminController.deleteThreshold); // 🌟 BẮT BUỘC phải có dấu ":" trước chữ id

// 3. Cấu hình kết nối Telegram Bot
app.get("/api/alerts/telegram/config", adminController.getTelegramConfig); // 🌟 DÒNG MỚI THÊM
app.put("/api/alerts/telegram/config", adminController.updateTelegramConfig);

// ===================================================================
// IV. KHỞI CHẠY SERVER & WORKERS
// ===================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { 
  console.log(`[SERVER] Đang chạy tại http://localhost:${PORT}`); 
});

// Kích hoạt mạng lưới thu thập dữ liệu chạy ngầm & Hệ thống quét lỗi
require("./clientmqt");
require("./clientscada");
require("./clienttva");
require("./clientmonre");
require("./alertWorker"); // Khởi chạy Worker quét trạm Online/Offline ngầm