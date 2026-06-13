"use strict";

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Đường dẫn tới file DB
const dbPath = path.join(__dirname, "backend", "data", "mysql.db");
const db = new sqlite3.Database(dbPath);

console.log("--- 20 BẢN GHI MỚI NHẤT TRONG DATABASE ---");

db.all("SELECT * FROM station_readings ORDER BY id DESC LIMIT 100", [], (err, rows) => {
    if (err) {
        console.error("Lỗi đọc dữ liệu:", err.message);
    } else {
        console.table(rows); // Lệnh này sẽ in dữ liệu ra dạng bảng cực kỳ đẹp mắt
    }
    db.close();
});