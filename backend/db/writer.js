"use strict";

const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const MYSQL_DB_PATH = path.join(__dirname, "..", "data", "mysql.db");

// ── CẬP NHẬT SCHEMA 2 CỘT TIME STAMP ────────────────────────────────────────
const TABLE_SCHEMA = `
    CREATE TABLE IF NOT EXISTS station_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        station_id TEXT NOT NULL,
        data_ts TEXT NOT NULL,   -- Thời gian gốc của dữ liệu từ nguồn fetch
        saved_ts TEXT NOT NULL,  -- Thời gian tại mốc hệ thống lưu DB
        parameter TEXT NOT NULL,
        value REAL
    );
`;

function openDb(dbPath) {
    return new sqlite3.Database(dbPath);
}

function ensureTable(db) {
    return new Promise((resolve, reject) => {
        db.exec(TABLE_SCHEMA, (err) => {
            if (err) return reject(err);
            
            // Tự động kiểm tra nâng cấp cấu trúc nếu đang dùng DB phiên bản cũ
            db.all("PRAGMA table_info(station_readings)", (mErr, columns) => {
                if (mErr) return reject(mErr);
                const columnNames = columns.map((c) => c.name);
                
                // Nếu DB cũ chưa có cột saved_ts, thực hiện migration dọn dẹp bảng cũ
                if (columnNames.includes("saved_ts")) return resolve();

                console.log("[HỆ THỐNG] Phát hiện cấu trúc DB cũ, đang tự động nâng cấp schema...");
                const migrateSql = `
                    BEGIN TRANSACTION;
                    DROP TABLE IF EXISTS station_readings_old;
                    ALTER TABLE station_readings RENAME TO station_readings_old;
                    ${TABLE_SCHEMA.trim()}
                    INSERT INTO station_readings (id, station_id, data_ts, saved_ts, parameter, value)
                    SELECT id, station_id, ts, ts, parameter, value FROM station_readings_old;
                    DROP TABLE station_readings_old;
                    COMMIT;
                `;
                db.exec(migrateSql, (e) => e ? db.exec("ROLLBACK", () => reject(e)) : resolve());
            });
        });
    });
}

function insertRows(db, rows) {
    if (!rows.length) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
        let hasError = false;
        let lastError = null;

        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            // Sửa câu lệnh INSERT để nhận đủ 2 tham số thời gian mới
            const stmt = db.prepare("INSERT INTO station_readings (station_id, data_ts, saved_ts, parameter, value) VALUES (?, ?, ?, ?, ?)");

            rows.forEach((row) => {
                stmt.run([row.station_id, row.data_ts, row.saved_ts, row.parameter, row.value], (err) => {
                    if (err) { hasError = true; lastError = err; }
                });
            });

            stmt.finalize((err) => {
                if (err || hasError) {
                    db.run("ROLLBACK", () => reject(err || lastError));
                } else {
                    db.run("COMMIT", (cErr) => cErr ? db.exec("ROLLBACK", () => reject(cErr)) : resolve(rows.length));
                }
            });
        });
    });
}

function closeDb(db) {
    return new Promise((resolve, reject) => {
        db.close((err) => err ? reject(err) : resolve());
    });
}

function formatTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Xử lý chuỗi NDJSON thu được từ các module fetch và lưu vào SQLite với 2 cột timestamp phân biệt
 */
async function processNdjson(ndjson, options = {}) {
    if (!ndjson || !ndjson.trim()) {
        return { inserted: 0 };
    }

    const dbPath = options.dbPath || MYSQL_DB_PATH;
    
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const db = openDb(dbPath);

    try {
        await ensureTable(db);

        // Lấy thời gian thực tế ngay tại thời điểm thực thi hàm lưu này
        const systemSavedTs = formatTimestamp(new Date());

        const lines = ndjson.trim().split("\n");
        const rowsToInsert = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            
            const payload = JSON.parse(line);
            
            let stationId = "unknown";
            let prefix = "unknown";
            
            if (payload.tva_id) { stationId = payload.tva_id; prefix = "tva"; }
            else if (payload.scada_id) { stationId = payload.scada_id; prefix = "scada"; }
            else if (payload.mqtt_id) { stationId = payload.mqtt_id; prefix = "mqtt"; }
            else if (payload.station_id) { stationId = payload.station_id; prefix = ""; }

            const finalStationKey = prefix ? `${prefix}_${stationId}` : stationId;
            
            // Lấy ts gốc của dữ liệu fetch, nếu chuỗi không có (hoặc trống) sẽ dùng làm fallback bằng chính thời gian hệ thống lưu
            const rawDataTs = payload.ts || systemSavedTs; 

            const { tva_id, scada_id, mqtt_id, station_id, ts, ...measurements } = payload;

            Object.entries(measurements).forEach(([parameter, value]) => {
                if (value !== null && value !== undefined) {
                    rowsToInsert.push({
                        station_id: finalStationKey,
                        data_ts: rawDataTs,       // Lưu thời gian gốc của thiết bị/nguồn web
                        saved_ts: systemSavedTs,  // Lưu mốc thời gian thực hiện lưu DB
                        parameter: parameter,
                        value: Number(value)
                    });
                }
            });
        }

        const insertedCount = await insertRows(db, rowsToInsert);
        return { inserted: insertedCount };

    } catch (error) {
        throw error;
    } finally {
        await closeDb(db);
    }
}

module.exports = {
    MYSQL_DB_PATH,
    processNdjson
};