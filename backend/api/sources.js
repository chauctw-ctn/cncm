"use strict";

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "mysql.db");

const FLOW_GROUPS = {
    gp35: [
        "tva_tb25",
        "tva_tb24",
        "tva_tb27",
        "tva_tb2",
        "tva_tb12",
        "tva_tb23",
        "tva_tb20",
        "tva_tb4",
        "tva_tb22",
        "mqtt_g18",
        "mqtt_g15"
    ],
    gp36: [
        "tva_gs2nm2",
        "tva_gs3nm2",
        "mqtt_gs1nm2"
    ],
    gp391: [
        "tva_tb21",
        "tva_tb26"
    ],
    gp393: [
        "tva_gs3nm1",
        "tva_gs1nm1",
        "mqtt_gs2nm1"
    ],
    gpstn: [
        "tva_tb16",
        "mqtt_gtacvan",
        "mqtt_g30a",
        "mqtt_g31b",
        "mqtt_g29a"
    ]
};

const ALL_FLOW_STATIONS = [...new Set(Object.values(FLOW_GROUPS).flat())];
const HISTORY_GROUP_LABELS = {
    all: "TONG",
    gp35: "GP35",
    gp36: "GP36",
    gp391: "GP391",
    gp393: "GP393",
    gpstn: "GPSTN"
};

function openDb() {
    return new sqlite3.Database(dbPath);
}

function getLatestFlowSum(stationIds) {
    return new Promise((resolve, reject) => {
        if (!Array.isArray(stationIds) || stationIds.length === 0) {
            resolve({ value: 0, rows: [] });
            return;
        }

        const placeholders = stationIds.map(() => "?").join(",");
        const sql = `
            SELECT station_id, value, data_ts, saved_ts
            FROM station_readings AS sr
            WHERE sr.parameter = 'flow'
              AND sr.station_id IN (${placeholders})
              AND sr.id = (
                  SELECT MAX(inner_sr.id)
                  FROM station_readings AS inner_sr
                  WHERE inner_sr.station_id = sr.station_id
                    AND inner_sr.parameter = 'flow'
              )
            ORDER BY sr.station_id
        `;

        const db = openDb();

        db.all(sql, stationIds, (err, rows) => {
            db.close();

            if (err) {
                reject(err);
                return;
            }

            const value = rows.reduce((sum, row) => {
                const numberValue = Number(row.value);
                return Number.isFinite(numberValue) ? sum + numberValue : sum;
            }, 0);

            resolve({ value, rows });
        });
    });
}

function getFlowHistory(limit = 48) {
    return new Promise((resolve, reject) => {
        const safeLimit = Math.max(1, Math.min(Number(limit) || 48, 288));
        const mappings = Object.entries(FLOW_GROUPS).flatMap(([groupName, stationIds]) => (
            stationIds.map((stationId) => [stationId, groupName])
        ));
        const valuesSql = mappings.map(() => "(?, ?)").join(",");
        const params = mappings.flat();
        const sql = `
            WITH station_groups(station_id, group_name) AS (
                VALUES ${valuesSql}
            ),
            ranked AS (
                SELECT
                    station_groups.group_name,
                    station_readings.station_id,
                    COALESCE(station_readings.saved_ts, station_readings.data_ts) AS ts,
                    station_readings.value,
                    ROW_NUMBER() OVER (
                        PARTITION BY
                            station_groups.group_name,
                            station_readings.station_id,
                            COALESCE(station_readings.saved_ts, station_readings.data_ts)
                        ORDER BY station_readings.id DESC
                    ) AS rn
                FROM station_readings
                INNER JOIN station_groups
                    ON station_groups.station_id = station_readings.station_id
                WHERE station_readings.parameter = 'flow'
            ),
            grouped AS (
                SELECT
                    ts,
                    group_name,
                    SUM(CAST(value AS REAL)) AS flow
                FROM ranked
                WHERE rn = 1
                GROUP BY ts, group_name
            ),
            recent_ts AS (
                SELECT ts
                FROM grouped
                GROUP BY ts
                ORDER BY ts DESC
                LIMIT ?
            )
            SELECT grouped.ts, grouped.group_name, grouped.flow
            FROM grouped
            INNER JOIN recent_ts ON recent_ts.ts = grouped.ts
            ORDER BY grouped.ts ASC, grouped.group_name ASC
        `;

        const db = openDb();

        db.all(sql, [...params, safeLimit], (err, rows) => {
            db.close();

            if (err) {
                reject(err);
                return;
            }

            const byTimestamp = new Map();

            rows.forEach((row) => {
                if (!byTimestamp.has(row.ts)) {
                    byTimestamp.set(row.ts, {
                        ts: row.ts,
                        all: 0,
                        gp35: 0,
                        gp36: 0,
                        gp391: 0,
                        gp393: 0,
                        gpstn: 0
                    });
                }

                const point = byTimestamp.get(row.ts);
                const value = Number(row.flow) || 0;
                point[row.group_name] = Number(value.toFixed(2));
                point.all = Number((point.all + value).toFixed(2));
            });

            resolve([...byTimestamp.values()]);
        });
    });
}

function sendError(res, err) {
    console.error("[API][sources] Loi doc du lieu gauge:", err.message || err);
    res.status(500).json({
        success: false,
        error: "Khong doc duoc du lieu flow tu database"
    });
}

async function sendFlowGroup(req, res, groupName, stationIds) {
    try {
        const result = await getLatestFlowSum(stationIds);

        res.json({
            success: true,
            group: groupName,
            value: Number(result.value.toFixed(2)),
            unit: "m3/h",
            stations: stationIds,
            updated_at: result.rows.reduce((latest, row) => {
                const ts = row.saved_ts || row.data_ts || null;
                return ts && (!latest || ts > latest) ? ts : latest;
            }, null),
            items: result.rows
        });
    } catch (err) {
        sendError(res, err);
    }
}

router.get("/total-flow-all", (req, res) => {
    sendFlowGroup(req, res, "all", ALL_FLOW_STATIONS);
});

router.get("/total-flow-gp35", (req, res) => {
    sendFlowGroup(req, res, "gp35", FLOW_GROUPS.gp35);
});

router.get("/total-flow-gp36", (req, res) => {
    sendFlowGroup(req, res, "gp36", FLOW_GROUPS.gp36);
});

router.get("/total-flow-gp391", (req, res) => {
    sendFlowGroup(req, res, "gp391", FLOW_GROUPS.gp391);
});

router.get("/total-flow-gp393", (req, res) => {
    sendFlowGroup(req, res, "gp393", FLOW_GROUPS.gp393);
});

router.get("/total-flow-gpstn", (req, res) => {
    sendFlowGroup(req, res, "gpstn", FLOW_GROUPS.gpstn);
});

router.get("/flow-groups", async (req, res) => {
    try {
        const entries = await Promise.all(
            Object.entries(FLOW_GROUPS).map(async ([group, stations]) => {
                const result = await getLatestFlowSum(stations);
                return [group, Number(result.value.toFixed(2))];
            })
        );

        const groups = Object.fromEntries(entries);
        const total = Object.values(groups).reduce((sum, value) => sum + value, 0);

        res.json({
            success: true,
            value: Number(total.toFixed(2)),
            unit: "m3/h",
            groups
        });
    } catch (err) {
        sendError(res, err);
    }
});

router.get("/flow-history", async (req, res) => {
    try {
        const rows = await getFlowHistory(req.query.limit);

        res.json({
            success: true,
            unit: "m3/h",
            labels: HISTORY_GROUP_LABELS,
            rows
        });
    } catch (err) {
        sendError(res, err);
    }
});

module.exports = router;
