// // "use strict";

// // const express = require("express");
// // const { openDb } = require("../../db/connection");

// // const router = express.Router();

// // function dbAll(db, sql, params = []) {
// //   return new Promise((resolve, reject) => {
// //     db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
// //   });
// // }

// // function dbGet(db, sql, params = []) {
// //   return new Promise((resolve, reject) => {
// //     db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
// //   });
// // }

// // function dbRun(db, sql, params = []) {
// //   return new Promise((resolve, reject) => {
// //     db.run(sql, params, function (err) {
// //       err ? reject(err) : resolve(this);
// //     });
// //   });
// // }

// // function parseLoggerIds(value) {
// //   if (Array.isArray(value)) return value;
// //   try {
// //     return JSON.parse(value || "[]");
// //   } catch {
// //     return [];
// //   }
// // }

// // function todayRange() {
// //   const now = new Date();
// //   const pad = v => String(v).padStart(2, "0");
// //   const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
// //   return {
// //     start: `${d} 00:00:00`,
// //     end: `${d} 23:59:59`
// //   };
// // }

// // function monthRange() {
// //   const now = new Date();
// //   const pad = v => String(v).padStart(2, "0");
// //   const y = now.getFullYear();
// //   const m = now.getMonth();
// //   const start = `${y}-${pad(m + 1)}-01 00:00:00`;
// //   const last = new Date(y, m + 1, 0).getDate();
// //   const end = `${y}-${pad(m + 1)}-${pad(last)} 23:59:59`;
// //   return { start, end };
// // }

// // async function calcKpiFlow(db, loggerIds) {
// //   if (!loggerIds.length) return { value: 0, items: [] };

// //   const placeholders = loggerIds.map(() => "?").join(",");

// //   const rows = await dbAll(
// //     db,
// //     `
// //     SELECT
// //       l.logger_id,
// //       p.name,
// //       l.value,
// //       l.data_ts
// //     FROM logger_latest l
// //     LEFT JOIN logger_points p ON l.logger_id = p.logger_id
// //     WHERE l.tag_key = 'flow'
// //       AND l.logger_id IN (${placeholders})
// //     `,
// //     loggerIds
// //   );

// //   const value = rows.reduce((sum, r) => sum + Number(r.value || 0), 0);

// //   return { value, items: rows };
// // }

// // async function calcTotalByRange(db, loggerIds, start, end) {
// //   if (!loggerIds.length) return { value: 0, items: [] };

// //   const placeholders = loggerIds.map(() => "?").join(",");

// //   const rows = await dbAll(
// //     db,
// //     `
// //     SELECT
// //       logger_id,
// //       MIN(value) AS first_value,
// //       MAX(value) AS last_value,
// //       MAX(value) - MIN(value) AS total_value
// //     FROM logger_readings
// //     WHERE tag_key = 'totalIndex'
// //       AND logger_id IN (${placeholders})
// //       AND data_ts BETWEEN ? AND ?
// //     GROUP BY logger_id
// //     `,
// //     [...loggerIds, start, end]
// //   );

// //   const value = rows.reduce((sum, r) => sum + Number(r.total_value || 0), 0);

// //   return { value, items: rows, start, end };
// // }

// // router.get("/", async (req, res) => {
// //   const db = openDb();

// //   try {
// //     const rows = await dbAll(db, `SELECT * FROM kpi_configs ORDER BY id DESC`);
// //     rows.forEach(r => r.logger_ids = parseLoggerIds(r.logger_ids));

// //     res.json({ success: true, data: rows });
// //   } catch (err) {
// //     res.status(500).json({ success: false, message: err.message });
// //   } finally {
// //     db.close();
// //   }
// // });

// // router.post("/", async (req, res) => {
// //   const { kpi_id, kpi_type, name, logger_ids = [], enabled = 1 } = req.body;

// //   if (!kpi_id || !kpi_type || !Array.isArray(logger_ids)) {
// //     return res.status(400).json({
// //       success: false,
// //       message: "Thiếu kpi_id, kpi_type hoặc logger_ids"
// //     });
// //   }

// //   const tagKey = kpi_type === "kpi-total" ? "totalIndex" : "flow";
// //   const db = openDb();

// //   try {
// //     await dbRun(
// //       db,
// //       `
// //       INSERT INTO kpi_configs (
// //         kpi_id, kpi_type, name, tag_key, logger_ids, enabled
// //       )
// //       VALUES (?, ?, ?, ?, ?, ?)
// //       ON CONFLICT(kpi_id) DO UPDATE SET
// //         kpi_type = excluded.kpi_type,
// //         name = excluded.name,
// //         tag_key = excluded.tag_key,
// //         logger_ids = excluded.logger_ids,
// //         enabled = excluded.enabled,
// //         updated_ts = CURRENT_TIMESTAMP
// //       `,
// //       [
// //         kpi_id,
// //         kpi_type,
// //         name || kpi_id,
// //         tagKey,
// //         JSON.stringify(logger_ids),
// //         enabled
// //       ]
// //     );

// //     res.json({ success: true, message: "Đã lưu KPI", kpi_id });
// //   } catch (err) {
// //     res.status(500).json({ success: false, message: err.message });
// //   } finally {
// //     db.close();
// //   }
// // });

// // router.put("/:kpi_id", async (req, res) => {
// //   const { kpi_id } = req.params;
// //   const { kpi_type, name, logger_ids, enabled } = req.body;
// //   const tagKey = kpi_type === "kpi-total" ? "totalIndex" : kpi_type === "kpi-flow" ? "flow" : null;

// //   const db = openDb();

// //   try {
// //     await dbRun(
// //       db,
// //       `
// //       UPDATE kpi_configs
// //       SET
// //         kpi_type = COALESCE(?, kpi_type),
// //         name = COALESCE(?, name),
// //         tag_key = COALESCE(?, tag_key),
// //         logger_ids = COALESCE(?, logger_ids),
// //         enabled = COALESCE(?, enabled),
// //         updated_ts = CURRENT_TIMESTAMP
// //       WHERE kpi_id = ?
// //       `,
// //       [
// //         kpi_type ?? null,
// //         name ?? null,
// //         tagKey,
// //         Array.isArray(logger_ids) ? JSON.stringify(logger_ids) : null,
// //         enabled ?? null,
// //         kpi_id
// //       ]
// //     );

// //     res.json({ success: true, message: "Đã cập nhật KPI", kpi_id });
// //   } catch (err) {
// //     res.status(500).json({ success: false, message: err.message });
// //   } finally {
// //     db.close();
// //   }
// // });

// // router.delete("/:kpi_id", async (req, res) => {
// //   const db = openDb();

// //   try {
// //     const result = await dbRun(
// //       db,
// //       `DELETE FROM kpi_configs WHERE kpi_id = ?`,
// //       [req.params.kpi_id]
// //     );

// //     res.json({ success: true, deleted: result.changes });
// //   } catch (err) {
// //     res.status(500).json({ success: false, message: err.message });
// //   } finally {
// //     db.close();
// //   }
// // });

// // router.get("/:kpi_id/value", async (req, res) => {
// //   const db = openDb();

// //   try {
// //     const config = await dbGet(
// //       db,
// //       `SELECT * FROM kpi_configs WHERE kpi_id = ?`,
// //       [req.params.kpi_id]
// //     );

// //     if (!config) {
// //       return res.status(404).json({ success: false, message: "Không tìm thấy KPI" });
// //     }

// //     const loggerIds = parseLoggerIds(config.logger_ids);

// //     if (config.kpi_type === "kpi-flow") {
// //       const result = await calcKpiFlow(db, loggerIds);
// //       return res.json({
// //         success: true,
// //         kpi_id: config.kpi_id,
// //         kpi_type: config.kpi_type,
// //         name: config.name,
// //         value: result.value,
// //         unit: "m³/h",
// //         items: result.items
// //       });
// //     }

// //     const today = todayRange();
// //     const month = monthRange();

// //     const todayResult = await calcTotalByRange(db, loggerIds, today.start, today.end);
// //     const monthResult = await calcTotalByRange(db, loggerIds, month.start, month.end);

// //     res.json({
// //       success: true,
// //       kpi_id: config.kpi_id,
// //       kpi_type: config.kpi_type,
// //       name: config.name,
// //       unit: "m³",
// //       today: todayResult,
// //       month: monthResult
// //     });
// //   } catch (err) {
// //     res.status(500).json({ success: false, message: err.message });
// //   } finally {
// //     db.close();
// //   }
// // });

// // module.exports = router;



// "use strict";

// const express = require("express");
// const { openDb } = require("../../db/connection");

// const router = express.Router();

// function all(db, sql, params = []) {
//   return new Promise((resolve, reject) => {
//     db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
//   });
// }

// function get(db, sql, params = []) {
//   return new Promise((resolve, reject) => {
//     db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
//   });
// }

// function run(db, sql, params = []) {
//   return new Promise((resolve, reject) => {
//     db.run(sql, params, function (err) {
//       err ? reject(err) : resolve(this);
//     });
//   });
// }

// function parseLoggerIds(value) {
//   if (Array.isArray(value)) return value;

//   try {
//     return JSON.parse(value || "[]");
//   } catch {
//     return [];
//   }
// }

// function pad(v) {
//   return String(v).padStart(2, "0");
// }

// function formatDateTime(date) {
//   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
// }

// function parseDateTime(value) {
//   if (!value) return null;
//   return new Date(String(value).replace(" ", "T"));
// }

// function roundDateToBucket(value, intervalMinutes) {
//   const d = parseDateTime(value);
//   if (!d || Number.isNaN(d.getTime())) return value;

//   d.setSeconds(0);
//   d.setMilliseconds(0);

//   const total = d.getHours() * 60 + d.getMinutes();
//   const rounded = Math.floor(total / intervalMinutes) * intervalMinutes;

//   d.setHours(Math.floor(rounded / 60));
//   d.setMinutes(rounded % 60);

//   return formatDateTime(d);
// }

// function parseInterval(value) {
//   const raw = String(value || "15m").toLowerCase();

//   if (raw.endsWith("m")) return Number(raw.replace("m", "")) || 15;
//   if (raw.endsWith("h")) return (Number(raw.replace("h", "")) || 1) * 60;
//   if (raw.endsWith("d")) return (Number(raw.replace("d", "")) || 1) * 1440;

//   return 15;
// }

// function todayRange() {
//   const now = new Date();
//   const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

//   return {
//     start: `${d} 00:00:00`,
//     end: `${d} 23:59:59`
//   };
// }

// function monthRange() {
//   const now = new Date();
//   const y = now.getFullYear();
//   const m = now.getMonth();
//   const lastDay = new Date(y, m + 1, 0).getDate();

//   return {
//     start: `${y}-${pad(m + 1)}-01 00:00:00`,
//     end: `${y}-${pad(m + 1)}-${pad(lastDay)} 23:59:59`
//   };
// }

// async function calcKpiFlow(db, loggerIds) {
//   if (!loggerIds.length) {
//     return { value: 0, items: [] };
//   }

//   const placeholders = loggerIds.map(() => "?").join(",");

//   const rows = await all(
//     db,
//     `
//     SELECT
//       l.logger_id,
//       p.name AS logger_name,
//       l.value,
//       l.data_ts
//     FROM logger_latest l
//     LEFT JOIN logger_points p
//       ON l.logger_id = p.logger_id
//     WHERE l.tag_key = 'flow'
//       AND l.logger_id IN (${placeholders})
//     `,
//     loggerIds
//   );

//   const value = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);

//   return { value, items: rows };
// }

// async function calcTotalByRange(db, loggerIds, start, end) {
//   if (!loggerIds.length) {
//     return { value: 0, items: [] };
//   }

//   const placeholders = loggerIds.map(() => "?").join(",");

//   const rows = await all(
//     db,
//     `
//     SELECT
//       logger_id,
//       MIN(value) AS first_value,
//       MAX(value) AS last_value,
//       MAX(value) - MIN(value) AS total_value
//     FROM logger_readings
//     WHERE tag_key = 'totalIndex'
//       AND logger_id IN (${placeholders})
//       AND data_ts BETWEEN ? AND ?
//     GROUP BY logger_id
//     `,
//     [...loggerIds, start, end]
//   );

//   const value = rows.reduce((sum, row) => sum + Number(row.total_value || 0), 0);

//   return { value, items: rows, start, end };
// }

// router.get("/", async (req, res) => {
//   const db = openDb();

//   try {
//     const rows = await all(db, `SELECT * FROM kpi_configs ORDER BY id DESC`);

//     rows.forEach(row => {
//       row.logger_ids = parseLoggerIds(row.logger_ids);
//     });

//     res.json({ success: true, data: rows });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     db.close();
//   }
// });

// router.post("/", async (req, res) => {
//   const {
//     kpi_id,
//     kpi_type,
//     name,
//     logger_ids = [],
//     enabled = 1
//   } = req.body;

//   if (!kpi_id || !kpi_type || !Array.isArray(logger_ids)) {
//     return res.status(400).json({
//       success: false,
//       message: "Thiếu kpi_id, kpi_type hoặc logger_ids"
//     });
//   }

//   const tagKey = kpi_type === "kpi-total" ? "totalIndex" : "flow";
//   const db = openDb();

//   try {
//     await run(
//       db,
//       `
//       INSERT INTO kpi_configs (
//         kpi_id, kpi_type, name, tag_key, logger_ids, enabled
//       )
//       VALUES (?, ?, ?, ?, ?, ?)
//       ON CONFLICT(kpi_id) DO UPDATE SET
//         kpi_type = excluded.kpi_type,
//         name = excluded.name,
//         tag_key = excluded.tag_key,
//         logger_ids = excluded.logger_ids,
//         enabled = excluded.enabled,
//         updated_ts = CURRENT_TIMESTAMP
//       `,
//       [
//         kpi_id,
//         kpi_type,
//         name || kpi_id,
//         tagKey,
//         JSON.stringify(logger_ids),
//         enabled
//       ]
//     );

//     res.json({ success: true, message: "Đã lưu KPI", kpi_id });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     db.close();
//   }
// });

// router.put("/:kpi_id", async (req, res) => {
//   const { kpi_id } = req.params;
//   const { kpi_type, name, logger_ids, enabled } = req.body;

//   const tagKey =
//     kpi_type === "kpi-total"
//       ? "totalIndex"
//       : kpi_type === "kpi-flow"
//         ? "flow"
//         : null;

//   const db = openDb();

//   try {
//     const result = await run(
//       db,
//       `
//       UPDATE kpi_configs
//       SET
//         kpi_type = COALESCE(?, kpi_type),
//         name = COALESCE(?, name),
//         tag_key = COALESCE(?, tag_key),
//         logger_ids = COALESCE(?, logger_ids),
//         enabled = COALESCE(?, enabled),
//         updated_ts = CURRENT_TIMESTAMP
//       WHERE kpi_id = ?
//       `,
//       [
//         kpi_type ?? null,
//         name ?? null,
//         tagKey,
//         Array.isArray(logger_ids) ? JSON.stringify(logger_ids) : null,
//         enabled ?? null,
//         kpi_id
//       ]
//     );

//     res.json({ success: true, changed: result.changes, kpi_id });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     db.close();
//   }
// });

// router.delete("/:kpi_id", async (req, res) => {
//   const db = openDb();

//   try {
//     const result = await run(
//       db,
//       `DELETE FROM kpi_configs WHERE kpi_id = ?`,
//       [req.params.kpi_id]
//     );

//     res.json({ success: true, deleted: result.changes });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     db.close();
//   }
// });

// router.get("/:kpi_id/value", async (req, res) => {
//   const db = openDb();

//   try {
//     const config = await get(
//       db,
//       `SELECT * FROM kpi_configs WHERE kpi_id = ?`,
//       [req.params.kpi_id]
//     );

//     if (!config) {
//       return res.status(404).json({
//         success: false,
//         message: "Không tìm thấy KPI"
//       });
//     }

//     const loggerIds = parseLoggerIds(config.logger_ids);

//     if (config.kpi_type === "kpi-flow") {
//       const result = await calcKpiFlow(db, loggerIds);

//       return res.json({
//         success: true,
//         kpi_id: config.kpi_id,
//         kpi_type: config.kpi_type,
//         name: config.name,
//         value: result.value,
//         unit: "m³/h",
//         max_value: 5000,
//         items: result.items
//       });
//     }

//     const today = todayRange();
//     const month = monthRange();

//     const todayResult = await calcTotalByRange(db, loggerIds, today.start, today.end);
//     const monthResult = await calcTotalByRange(db, loggerIds, month.start, month.end);

//     res.json({
//       success: true,
//       kpi_id: config.kpi_id,
//       kpi_type: config.kpi_type,
//       name: config.name,
//       value: todayResult.value,
//       unit: "m³",
//       max_value: 100000,
//       today: todayResult,
//       month: monthResult
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     db.close();
//   }
// });

// router.get("/:kpi_id/history", async (req, res) => {
//   const {
//     from,
//     to,
//     interval = "15m",
//     limit = 50000
//   } = req.query;

//   const db = openDb();

//   try {
//     const config = await get(
//       db,
//       `SELECT * FROM kpi_configs WHERE kpi_id = ?`,
//       [req.params.kpi_id]
//     );

//     if (!config) {
//       return res.status(404).json({
//         success: false,
//         message: "Không tìm thấy KPI"
//       });
//     }

//     const loggerIds = parseLoggerIds(config.logger_ids);

//     if (!loggerIds.length) {
//       return res.json({
//         success: true,
//         kpi_id: config.kpi_id,
//         data: []
//       });
//     }

//     const tagKey = config.kpi_type === "kpi-total" ? "totalIndex" : "flow";
//     const intervalMinutes = parseInterval(interval);
//     const placeholders = loggerIds.map(() => "?").join(",");

//     const where = [
//       `logger_id IN (${placeholders})`,
//       `tag_key = ?`
//     ];

//     const params = [...loggerIds, tagKey];

//     if (from) {
//       where.push(`data_ts >= ?`);
//       params.push(from);
//     }

//     if (to) {
//       where.push(`data_ts <= ?`);
//       params.push(to);
//     }

//     const rows = await all(
//       db,
//       `
//       SELECT logger_id, tag_key, value, data_ts
//       FROM logger_readings
//       WHERE ${where.join(" AND ")}
//       ORDER BY data_ts ASC
//       LIMIT ?
//       `,
//       [...params, Number(limit)]
//     );

//     const bucketMap = new Map();

//     for (const row of rows) {
//       const bucket = roundDateToBucket(row.data_ts, intervalMinutes);

//       if (!bucketMap.has(bucket)) {
//         bucketMap.set(bucket, {
//           ts: bucket,
//           values: {}
//         });
//       }

//       bucketMap.get(bucket).values[row.logger_id] = Number(row.value || 0);
//     }

//     const data = Array.from(bucketMap.values())
//       .map(bucket => {
//         const values = Object.values(bucket.values);

//         let value = 0;

//         if (config.kpi_type === "kpi-flow") {
//           value = values.reduce((sum, v) => sum + Number(v || 0), 0);
//         } else {
//           value = values.reduce((sum, v) => sum + Number(v || 0), 0);
//         }

//         return {
//           ts: bucket.ts,
//           value
//         };
//       })
//       .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

//     res.json({
//       success: true,
//       kpi_id: config.kpi_id,
//       kpi_type: config.kpi_type,
//       name: config.name,
//       unit: config.kpi_type === "kpi-flow" ? "m³/h" : "m³",
//       filters: {
//         from: from || null,
//         to: to || null,
//         interval
//       },
//       data
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   } finally {
//     db.close();
//   }
// });

// module.exports = router;


"use strict";

const express = require("express");
const { openDb } = require("../../db/connection");

const router = express.Router();

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve(this);
    });
  });
}

async function ensureKpiColumns(db) {
  const cols = await all(db, `PRAGMA table_info(kpi_configs)`);
  const names = cols.map(c => c.name);

  if (!names.includes("kpi_metrics")) {
    await run(db, `ALTER TABLE kpi_configs ADD COLUMN kpi_metrics TEXT DEFAULT '[]'`);
  }

  if (!names.includes("max_value")) {
    await run(db, `ALTER TABLE kpi_configs ADD COLUMN max_value REAL`);
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pad(v) {
  return String(v).padStart(2, "0");
}

function fmt(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function todayRange() {
  const now = new Date();
  return {
    start: fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)),
    end: fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59))
  };
}

function yesterdayRange() {
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return {
    start: fmt(new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0)),
    end: fmt(new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59))
  };
}

function thisMonthRange() {
  const now = new Date();
  return {
    start: fmt(new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)),
    end: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59))
  };
}

function lastMonthRange() {
  const now = new Date();
  return {
    start: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0)),
    end: fmt(new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59))
  };
}

async function calcLatestSum(db, loggerIds, tagKey) {
  if (!loggerIds.length) return { value: 0, items: [] };

  const placeholders = loggerIds.map(() => "?").join(",");

  const rows = await all(
    db,
    `
    SELECT
      l.logger_id,
      p.name AS logger_name,
      l.tag_key,
      l.value,
      l.data_ts
    FROM logger_latest l
    LEFT JOIN logger_points p ON l.logger_id = p.logger_id
    WHERE l.tag_key = ?
      AND l.logger_id IN (${placeholders})
    `,
    [tagKey, ...loggerIds]
  );

  const value = rows.reduce((sum, r) => sum + Number(r.value || 0), 0);

  return { value, items: rows };
}

async function calcTotalIndexDelta(db, loggerIds, start, end) {
  if (!loggerIds.length) return { value: 0, items: [], start, end };

  const placeholders = loggerIds.map(() => "?").join(",");

  const rows = await all(
    db,
    `
    SELECT
      logger_id,
      MIN(value) AS first_value,
      MAX(value) AS last_value,
      MAX(value) - MIN(value) AS total_value
    FROM logger_readings
    WHERE tag_key = 'totalIndex'
      AND logger_id IN (${placeholders})
      AND data_ts BETWEEN ? AND ?
    GROUP BY logger_id
    `,
    [...loggerIds, start, end]
  );

  const value = rows.reduce((sum, r) => sum + Number(r.total_value || 0), 0);

  return { value, items: rows, start, end };
}

async function calcFlowPeriod(db, loggerIds, start, end) {
  if (!loggerIds.length) {
    return {
      value: 0,
      avg_value: 0,
      min_value: 0,
      max_value: 0,
      raw_count: 0,
      start,
      end
    };
  }

  const placeholders = loggerIds.map(() => "?").join(",");

  const row = await get(
    db,
    `
    SELECT
      AVG(value) AS avg_value,
      MIN(value) AS min_value,
      MAX(value) AS max_value,
      SUM(value) AS sum_value,
      COUNT(*) AS raw_count
    FROM logger_readings
    WHERE tag_key = 'flow'
      AND logger_id IN (${placeholders})
      AND data_ts BETWEEN ? AND ?
    `,
    [...loggerIds, start, end]
  );

  return {
    value: Number(row?.avg_value || 0),
    avg_value: Number(row?.avg_value || 0),
    min_value: Number(row?.min_value || 0),
    max_value: Number(row?.max_value || 0),
    sum_value: Number(row?.sum_value || 0),
    raw_count: Number(row?.raw_count || 0),
    start,
    end
  };
}

function parseDateTime(value) {
  if (!value) return null;
  return new Date(String(value).replace(" ", "T"));
}

function roundDateToBucket(value, intervalMinutes) {
  const d = parseDateTime(value);
  if (!d || Number.isNaN(d.getTime())) return value;

  d.setSeconds(0);
  d.setMilliseconds(0);

  const total = d.getHours() * 60 + d.getMinutes();
  const rounded = Math.floor(total / intervalMinutes) * intervalMinutes;

  d.setHours(Math.floor(rounded / 60));
  d.setMinutes(rounded % 60);

  return fmt(d);
}

function parseInterval(value) {
  const raw = String(value || "15m").toLowerCase();

  if (raw.endsWith("m")) return Number(raw.replace("m", "")) || 15;
  if (raw.endsWith("h")) return (Number(raw.replace("h", "")) || 1) * 60;
  if (raw.endsWith("d")) return (Number(raw.replace("d", "")) || 1) * 1440;

  return 15;
}

router.get("/", async (req, res) => {
  const db = openDb();

  try {
    await ensureKpiColumns(db);

    const rows = await all(db, `SELECT * FROM kpi_configs ORDER BY id DESC`);

    rows.forEach(r => {
      r.logger_ids = parseJsonArray(r.logger_ids);
      r.kpi_metrics = parseJsonArray(r.kpi_metrics);
    });

    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.post("/", async (req, res) => {
  const {
    kpi_id,
    kpi_type,
    name,
    logger_ids = [],
    kpi_metrics = [],
    max_value = null,
    enabled = 1
  } = req.body;

  if (!kpi_id || !kpi_type || !Array.isArray(logger_ids)) {
    return res.status(400).json({
      success: false,
      message: "Thiếu kpi_id, kpi_type hoặc logger_ids"
    });
  }

  const tagKey = kpi_type === "kpi-total" ? "totalIndex" : "flow";
  const db = openDb();

  try {
    await ensureKpiColumns(db);

    await run(
      db,
      `
      INSERT INTO kpi_configs (
        kpi_id, kpi_type, name, tag_key, logger_ids, kpi_metrics, max_value, enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kpi_id) DO UPDATE SET
        kpi_type = excluded.kpi_type,
        name = excluded.name,
        tag_key = excluded.tag_key,
        logger_ids = excluded.logger_ids,
        kpi_metrics = excluded.kpi_metrics,
        max_value = excluded.max_value,
        enabled = excluded.enabled,
        updated_ts = CURRENT_TIMESTAMP
      `,
      [
        kpi_id,
        kpi_type,
        name || kpi_id,
        tagKey,
        JSON.stringify(logger_ids),
        JSON.stringify(kpi_metrics),
        max_value,
        enabled
      ]
    );

    res.json({ success: true, message: "Đã lưu KPI", kpi_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.put("/:kpi_id", async (req, res) => {
  const { kpi_id } = req.params;
  const {
    kpi_type,
    name,
    logger_ids,
    kpi_metrics,
    max_value,
    enabled
  } = req.body;

  const tagKey =
    kpi_type === "kpi-total"
      ? "totalIndex"
      : kpi_type === "kpi-flow"
        ? "flow"
        : null;

  const db = openDb();

  try {
    await ensureKpiColumns(db);

    const result = await run(
      db,
      `
      UPDATE kpi_configs
      SET
        kpi_type = COALESCE(?, kpi_type),
        name = COALESCE(?, name),
        tag_key = COALESCE(?, tag_key),
        logger_ids = COALESCE(?, logger_ids),
        kpi_metrics = COALESCE(?, kpi_metrics),
        max_value = COALESCE(?, max_value),
        enabled = COALESCE(?, enabled),
        updated_ts = CURRENT_TIMESTAMP
      WHERE kpi_id = ?
      `,
      [
        kpi_type ?? null,
        name ?? null,
        tagKey,
        Array.isArray(logger_ids) ? JSON.stringify(logger_ids) : null,
        Array.isArray(kpi_metrics) ? JSON.stringify(kpi_metrics) : null,
        max_value ?? null,
        enabled ?? null,
        kpi_id
      ]
    );

    res.json({ success: true, changed: result.changes, kpi_id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.delete("/:kpi_id", async (req, res) => {
  const db = openDb();

  try {
    const result = await run(
      db,
      `DELETE FROM kpi_configs WHERE kpi_id = ?`,
      [req.params.kpi_id]
    );

    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.get("/:kpi_id/value", async (req, res) => {
  const db = openDb();

  try {
    await ensureKpiColumns(db);

    const config = await get(
      db,
      `SELECT * FROM kpi_configs WHERE kpi_id = ?`,
      [req.params.kpi_id]
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy KPI"
      });
    }

    const loggerIds = parseJsonArray(config.logger_ids);
    const metrics = parseJsonArray(config.kpi_metrics);

    const today = todayRange();
    const yesterday = yesterdayRange();
    const thisMonth = thisMonthRange();
    const lastMonth = lastMonthRange();

    if (config.kpi_type === "kpi-flow") {
      const current = await calcLatestSum(db, loggerIds, "flow");

      const todayFlow = await calcFlowPeriod(db, loggerIds, today.start, today.end);
      const yesterdayFlow = await calcFlowPeriod(db, loggerIds, yesterday.start, yesterday.end);
      const thisMonthFlow = await calcFlowPeriod(db, loggerIds, thisMonth.start, thisMonth.end);
      const lastMonthFlow = await calcFlowPeriod(db, loggerIds, lastMonth.start, lastMonth.end);

      return res.json({
        success: true,
        kpi_id: config.kpi_id,
        kpi_type: config.kpi_type,
        name: config.name,
        unit: "m³/h",
        value: current.value,
        max_value: config.max_value || Math.max(current.value * 1.5, 100),
        logger_ids: loggerIds,
        kpi_metrics: metrics,
        current,
        periods: {
          today: todayFlow,
          yesterday: yesterdayFlow,
          this_month: thisMonthFlow,
          last_month: lastMonthFlow
        }
      });
    }

    const current = await calcLatestSum(db, loggerIds, "totalIndex");

    const todayTotal = await calcTotalIndexDelta(db, loggerIds, today.start, today.end);
    const yesterdayTotal = await calcTotalIndexDelta(db, loggerIds, yesterday.start, yesterday.end);
    const thisMonthTotal = await calcTotalIndexDelta(db, loggerIds, thisMonth.start, thisMonth.end);
    const lastMonthTotal = await calcTotalIndexDelta(db, loggerIds, lastMonth.start, lastMonth.end);

    res.json({
      success: true,
      kpi_id: config.kpi_id,
      kpi_type: config.kpi_type,
      name: config.name,
      unit: "m³",
      value: todayTotal.value,
      max_value: config.max_value || Math.max(todayTotal.value * 1.3, 1000),
      logger_ids: loggerIds,
      kpi_metrics: metrics,
      current,
      periods: {
        today: todayTotal,
        yesterday: yesterdayTotal,
        this_month: thisMonthTotal,
        last_month: lastMonthTotal
      },
      today: todayTotal,
      month: thisMonthTotal
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

router.get("/:kpi_id/history", async (req, res) => {
  const {
    from,
    to,
    interval = "15m",
    limit = 50000
  } = req.query;

  const db = openDb();

  try {
    await ensureKpiColumns(db);

    const config = await get(
      db,
      `SELECT * FROM kpi_configs WHERE kpi_id = ?`,
      [req.params.kpi_id]
    );

    if (!config) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy KPI"
      });
    }

    const loggerIds = parseJsonArray(config.logger_ids);

    if (!loggerIds.length) {
      return res.json({
        success: true,
        kpi_id: config.kpi_id,
        data: []
      });
    }

    const tagKey = config.kpi_type === "kpi-total" ? "totalIndex" : "flow";
    const intervalMinutes = parseInterval(interval);
    const placeholders = loggerIds.map(() => "?").join(",");

    const where = [
      `logger_id IN (${placeholders})`,
      `tag_key = ?`
    ];

    const params = [...loggerIds, tagKey];

    if (from) {
      where.push(`data_ts >= ?`);
      params.push(from);
    }

    if (to) {
      where.push(`data_ts <= ?`);
      params.push(to);
    }

    const rows = await all(
      db,
      `
      SELECT logger_id, tag_key, value, data_ts
      FROM logger_readings
      WHERE ${where.join(" AND ")}
      ORDER BY data_ts ASC
      LIMIT ?
      `,
      [...params, Number(limit)]
    );

    const bucketMap = new Map();

    for (const row of rows) {
      const bucket = roundDateToBucket(row.data_ts, intervalMinutes);

      if (!bucketMap.has(bucket)) {
        bucketMap.set(bucket, {
          ts: bucket,
          values: {}
        });
      }

      bucketMap.get(bucket).values[row.logger_id] = Number(row.value || 0);
    }

    const data = Array.from(bucketMap.values())
      .map(bucket => {
        const values = Object.values(bucket.values);

        return {
          ts: bucket.ts,
          value: values.reduce((sum, v) => sum + Number(v || 0), 0)
        };
      })
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

    res.json({
      success: true,
      kpi_id: config.kpi_id,
      kpi_type: config.kpi_type,
      name: config.name,
      unit: config.kpi_type === "kpi-flow" ? "m³/h" : "m³",
      filters: {
        from: from || null,
        to: to || null,
        interval
      },
      data
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    db.close();
  }
});

module.exports = router;