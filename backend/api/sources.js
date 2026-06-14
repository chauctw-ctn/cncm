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
// API DÙNG CHO MAP
const RAW_LOGGER_STATIONS = {
    g15: { lat: 9.1835, lgn: 105.152611 },
    g18: { lat: 9.175669, lgn: 105.170509 },
    g29a: { lat: 9.14649, lgn: 105.139282 },
    g30a: { lat: 9.165363, lgn: 105.157047 },
    g31b: { lat: 9.206425, lgn: 105.166463 },
    gs1nm1: { lat: 9.205068, lgn: 105.133103 },
    gs1nm2: { lat: 9.205104, lgn: 105.131994 },
    gs2nm1: { lat: 9.173416, lgn: 105.209793 },
    gs2nm2: { lat: 9.173416, lgn: 105.209793 },
    gs3nm1: { lat: 9.205121, lgn: 105.132026 },
    gs3nm2: { lat: 9.173283, lgn: 105.209918 },
    gs4nm1: { lat: 9.170691, lgn: 105.214664 },
    gs4nm2: { lat: 9.204509, lgn: 105.128481 },
    gs5nm1: { lat: 9.168239, lgn: 105.212727 },
    gtacvan: { lat: 9.163367, lgn: 105.251512 },
    qt1nm1: { lat: 9.173508, lgn: 105.209793 },
    qt1nm2: { lat: 9.205658, lgn: 105.12963 },
    qt2: { lat: 9.179219, lgn: 105.139376 },
    qt2nm1: { lat: 9.205197, lgn: 105.133057 },
    qt2nm2: { lat: 9.203337, lgn: 105.129712 },
    qt3: { lat: 9.178764, lgn: 105.162811 },
    qt4: { lat: 9.1815, lgn: 105.1488 },
    qt5: { lat: 9.178642, lgn: 105.154274 },
    tb1: { lat: 9.177, lgn: 105.152 },
    tb2: { lat: 9.241708, lgn: 105.134453 },
    tb4: { lat: 9.231647, lgn: 105.157951 },
    tb12: { lat: 9.196925, lgn: 105.160156 },
    tb16: { lat: 9.181186, lgn: 105.088219 },
    tb20: { lat: 9.152653, lgn: 105.157631 },
    tb21: { lat: 9.141861, lgn: 105.138564 },
    tb22: { lat: 9.130936, lgn: 105.135063 },
    tb23: { lat: 9.119739, lgn: 105.141647 },
    tb24: { lat: 9.108739, lgn: 105.136789 },
    tb25: { lat: 9.100839, lgn: 105.133297 },
    tb26: { lat: 9.092956, lgn: 105.133219 },
    tb27: { lat: 9.081444, lgn: 105.132731 }
};

const LOGGER_STATIONS = Object.fromEntries(
    Object.entries(RAW_LOGGER_STATIONS).flatMap(([rawId, pos]) => {
        return [
            [`tva_${rawId}`, {
                station_id: `tva_${rawId}`,
                raw_id: rawId,
                source: "tva",
                name: rawId.toUpperCase(),
                lat: pos.lat,
                lng: pos.lgn
            }],
            [`mqtt_${rawId}`, {
                station_id: `mqtt_${rawId}`,
                raw_id: rawId,
                source: "mqtt",
                name: rawId.toUpperCase(),
                lat: pos.lat,
                lng: pos.lgn
            }],
            [`scada_${rawId}`, {
                station_id: `scada_${rawId}`,
                raw_id: rawId,
                source: "scada",
                name: rawId.toUpperCase(),
                lat: pos.lat,
                lng: pos.lgn
            }]
        ];
    })
);
// API DÙNG CHO MAP

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

// API DÙNG CHO MAP
router.get("/map-loggers", (req, res) => {
    const stationIds = Object.keys(LOGGER_STATIONS);

    if (stationIds.length === 0) {
        res.json({
            success: true,
            total: 0,
            stations: []
        });
        return;
    }

    const placeholders = stationIds.map(() => "?").join(",");

    const sql = `
        SELECT sr.station_id, sr.parameter, sr.value, sr.data_ts, sr.saved_ts
        FROM station_readings sr
        WHERE sr.station_id IN (${placeholders})
          AND sr.id = (
              SELECT MAX(inner_sr.id)
              FROM station_readings inner_sr
              WHERE inner_sr.station_id = sr.station_id
                AND inner_sr.parameter = sr.parameter
          )
        ORDER BY sr.station_id, sr.parameter
    `;

    const db = openDb();

    db.all(sql, stationIds, (err, rows) => {
        db.close();

        if (err) {
            sendError(res, err);
            return;
        }

        const map = new Map();

        stationIds.forEach((stationId) => {
            map.set(stationId, {
                ...LOGGER_STATIONS[stationId],
                updated_at: null,
                data: {}
            });
        });

        rows.forEach((row) => {
            const station = map.get(row.station_id);
            if (!station) return;

            const value = Number(row.value);
            station.data[row.parameter] = Number.isFinite(value) ? value : row.value;

            const ts = row.saved_ts || row.data_ts || null;
            if (ts && (!station.updated_at || ts > station.updated_at)) {
                station.updated_at = ts;
            }
        });

        const stations = [...map.values()].filter((station) => {
            return Object.keys(station.data).length > 0;
        });

        res.json({
            success: true,
            total: stations.length,
            stations
        });
    });
});

router.get("/map-loggers/all", (req, res) => {
    const stations = Object.values(LOGGER_STATIONS).map((station) => ({
        ...station,
        updated_at: null,
        data: {}
    }));

    res.json({
        success: true,
        total: stations.length,
        stations
    });
});
// API DÙNG CHO MAP

module.exports = router;
