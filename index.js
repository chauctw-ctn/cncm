"use strict";

const express = require("express");
const path = require("path");

const {
  saveLoggerPayloads,
  processNdjson
} = require("./src/db/logger-writer");

const mqttClient = require("./src/sources/mqtt/client");
const scadaClient = require("./src/sources/scada/client");
const tvaClient = require("./src/sources/tva/client");
const monreClient = require("./src/sources/monre/client");

const ingestRoutes = require("./src/api/ingest.routes");
const loggerApi = require("./src/api/logger");

const {
  startAlertChecker
} = require("./src/services/alert-checker");

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(__dirname, "data/mysql.db");

/* =========================
   MQTT BUFFER
========================= */

const mqttBuffer = new Map();

const MQTT_SAVE_INTERVAL_MS =
  (Number(process.env.MQTT_SAVE_INTERVAL_MINUTES) || 5)
  * 60
  * 1000;

/* =========================
   EXPRESS
========================= */

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/ingest", ingestRoutes);
app.use("/api/logger", loggerApi);

app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    time: new Date().toISOString()
  });
});

/* =========================
   SAVE HELPER
========================= */

function savePayloads(payloads, sourceName) {

  if (!Array.isArray(payloads) || payloads.length === 0) {
    return;
  }

  saveLoggerPayloads(payloads, {
    dbPath: DB_PATH
  })
    .then((result) => {

      if (!result.success) {

        console.error(
          `[${sourceName}][SAVE ERROR]`,
          result.error
        );

        return;
      }

      console.log(
        `[${sourceName}][SAVE] loggers=${result.loggers}, inserted=${result.inserted}`
      );

    })
    .catch((err) => {

      console.error(
        `[${sourceName}][SAVE ERROR]`,
        err.message || err
      );

    });
}

/* =========================
   MQTT SAVE JOB
========================= */

function startMqttSaveJob() {

  setInterval(() => {

    try {

      const payloads =
        Array.from(mqttBuffer.values());

      if (payloads.length === 0) {
        return;
      }

      savePayloads(
        payloads,
        "MQTT"
      );

      mqttBuffer.clear();

    } catch (err) {

      console.error(
        "[MQTT][BUFFER ERROR]",
        err.message || err
      );

    }

  }, MQTT_SAVE_INTERVAL_MS);

  console.log(
    `[MQTT] Save every ${MQTT_SAVE_INTERVAL_MS / 60000} minutes`
  );
}

/* =========================
   MQTT
========================= */

function startMqttService() {

  try {

    const client = mqttClient.connect();

    client.on("connect", () => {

      console.log("[MQTT] Connected");

      mqttClient.subscribe(client);

    });

    client.on("reconnect", () => {

      console.log("[MQTT] Reconnecting...");

    });

    client.on("error", (err) => {

      console.error(
        "[MQTT] Error:",
        err.message || err
      );

    });

    mqttClient.onMessage(
      client,
      (payloads) => {

        if (!Array.isArray(payloads)) {
          return;
        }

        for (const payload of payloads) {

          const loggerId =
            payload.station_id ||
            payload.logger_id ||
            payload.raw_id;

          if (!loggerId) {
            continue;
          }

          mqttBuffer.set(
            loggerId,
            payload
          );
        }

      }
    );

    return client;

  } catch (err) {

    console.error(
      "[MQTT] Start failed:",
      err.message || err
    );

    return null;
  }
}

/* =========================
   SCADA
========================= */

function startScadaService() {

  try {

    const intervalMs =
      Number(process.env.SCADA_INTERVAL_MS)
      || 60000;

    const timer =
      scadaClient.startPolling(
        (payloads) => {

          savePayloads(
            payloads,
            "SCADA"
          );

        },
        intervalMs,
        {
          source: "scada"
        }
      );

    console.log(
      `[SCADA] Polling every ${intervalMs}ms`
    );

    return timer;

  } catch (err) {

    console.error(
      "[SCADA] Start failed:",
      err.message || err
    );

    return null;
  }
}

/* =========================
   TVA
========================= */

function startTvaService() {

  try {

    const jobs =
      tvaClient.scheduleTVAJobs({

        db: DB_PATH,

        source: "tva",

        fetchIntervalMs:
          Number(
            process.env.TVA_FETCH_INTERVAL_MS
          ) || 30000,

        saveIntervalMinutes:
          Number(
            process.env.TVA_SAVE_INTERVAL_MINUTES
          ) || 5,

        processNdjson:
          (ndjson, options) => {

            return processNdjson(
              ndjson,
              {
                ...options,
                dbPath: DB_PATH
              }
            );

          }
      });

    console.log("[TVA] Jobs started");

    return jobs;

  } catch (err) {

    console.error(
      "[TVA] Start failed:",
      err.message || err
    );

    return null;
  }
}

/* =========================
   MONRE
========================= */

function startMonreService() {

  try {

    const jobs =
      monreClient.scheduleMonreJobs({

        db: DB_PATH,

        source: "monre",

        fetchIntervalMs:
          Number(
            process.env.MONRE_FETCH_INTERVAL_MS
          ) || 30000,

        saveIntervalMinutes:
          Number(
            process.env.MONRE_SAVE_INTERVAL_MINUTES
          ) || 5,

        processNdjson:
          (ndjson, options) => {

            return processNdjson(
              ndjson,
              {
                ...options,
                dbPath: DB_PATH
              }
            );

          }
      });

    console.log("[MONRE] Jobs started");

    return jobs;

  } catch (err) {

    console.error(
      "[MONRE] Start failed:",
      err.message || err
    );

    return null;
  }
}

/* =========================
   START SERVICES
========================= */

function startServices() {

  console.log(
    "[SERVICES] Starting..."
  );

  startMqttSaveJob();

  const services = {

    mqtt: startMqttService(),

    scada: startScadaService(),

    tva: startTvaService(),

    monre: startMonreService(),

    alertChecker:
      startAlertChecker(
        Number(
          process.env.ALERT_CHECK_INTERVAL_MS
        ) || 60000
      )
  };

  console.log(
    "[SERVICES] Started"
  );

  return services;
}

/* =========================
   FALLBACK SPA
========================= */

app.use((req, res) => {

  res.sendFile(
    path.join(
      PUBLIC_DIR,
      "index.html"
    )
  );

});

/* =========================
   START SERVER
========================= */

const server =
  app.listen(PORT, () => {

    console.log(
      `[SERVER] http://localhost:${PORT}`
    );

    startServices();

  });

/* =========================
   SHUTDOWN
========================= */

function shutdown() {

  console.log(
    "[SERVER] Shutting down..."
  );

  server.close(() => {

    console.log(
      "[SERVER] Closed"
    );

    process.exit(0);

  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);