"use strict";

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Đường dẫn chính xác đến file DB của bạn (nằm trong thư mục data sát vách file này)
const dbPath = path.join(__dirname, "data", "mysql.db");
const db = new sqlite3.Database(dbPath);

console.log("--- BẮT ĐẦU QUÉT TOÀN BỘ CƠ SỞ DỮ LIỆU ---");

// HÀM TỰ ĐỘNG KHẮC PHỤC: Kiểm tra cấu trúc bảng logger_points và tự động thêm cột offline_minutes nếu thiếu
function upgradeDatabaseSchema(callback) {
    db.all(`PRAGMA table_info(logger_points)`, [], (err, columns) => {
        if (err) {
            // Nếu không có bảng logger_points hoặc lỗi khác, bỏ qua để chạy tiếp
            return callback();
        }
        
        const hasOfflineMinutes = columns.some(col => col.name === "offline_minutes");
        if (!hasOfflineMinutes) {
            console.log("⚙️ Phát hiện bảng [logger_points] thiếu cột [offline_minutes]. Tiến hành nâng cấp...");
            db.run(`ALTER TABLE logger_points ADD COLUMN offline_minutes INTEGER DEFAULT 30`, (alterErr) => {
                if (alterErr) {
                    console.error("❌ Lỗi nâng cấp cấu trúc bảng:", alterErr.message);
                } else {
                    console.log("✅ Đã tự động bổ sung cột [offline_minutes] thành công!");
                }
                callback();
            });
        } else {
            callback();
        }
    });
}

// Chạy luồng kiểm tra cấu trúc trước, sau đó mới quét dữ liệu bảng
upgradeDatabaseSchema(() => {
    // Truy vấn lấy danh sách tất cả các bảng trong file SQLite
    const queryGetTables = `
        SELECT name 
        FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `;

    db.all(queryGetTables, [], async (err, tables) => {
        if (err) {
            console.error("❌ Lỗi lấy danh sách bảng:", err.message);
            db.close();
            return;
        }

        if (tables.length === 0) {
            console.log("ℹ️ Cơ sở dữ liệu trống (Không tìm thấy bảng nào).");
            db.close();
            return;
        }

        console.log(`📊 Tìm thấy tổng cộng ${tables.length} bảng.`);

        for (const table of tables) {
            const tableName = table.name;
            
            console.log(`\n==================================================`);
            console.log(`📌 BẢNG: [ ${tableName.toUpperCase()} ]`);
            console.log(`==================================================`);

            await new Promise((resolve) => {
                // ĐÃ SỬA: Thay đổi LIMIT thành 10 dòng dữ liệu
                db.all(`SELECT * FROM ${tableName} LIMIT 10`, [], (errRows, rows) => {
                    if (errRows) {
                        console.error(`❌ Lỗi đọc dữ liệu từ bảng ${tableName}:`, errRows.message);
                    } else {
                        if (rows.length === 0) {
                            console.log(`(Bảng này hiện tại chưa có dữ liệu)`);
                        } else {
                            console.log(`✨ Hiển thị 10 dòng dữ liệu:`);
                            console.table(rows);
                        }
                    }
                    resolve();
                });
            });
        }

        db.close();
        console.log("\n--- HOÀN THÀNH QUÉT DATABASE ---");
    });
});